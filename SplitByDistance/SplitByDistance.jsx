// SplitByDistance.jsx
// 距離ベースのレイヤー自動分割ツール v2
//
// 概要：
//   コンポ内に散らばって配置されたレイヤー（添付画像のような、離れた図形の集合）を
//   「近くにあるもの同士」でグループ化し、グループ（＝離れたオブジェクト）ごとに
//   新規コンポジションへ自動で振り分けるスクリプト。
//
//   検出モードは2種類：
//     ① レイヤー単位：コンプ内の既存の複数レイヤーを、それぞれの位置で判定
//     ② ピクセル単位：1枚の画像（1レイヤー）の中身を解析し、
//        アルファ（透明部分）または背景色（白 / 黒 / 自動判定）をもとに
//        「離れたオブジェクト」を自動検出する
//
// 使い方：
//   1. 対象コンポを開く（必要なら対象レイヤーを選択）
//   2. 検出モードを選び、しきい値・余白などを設定して [実行]
//   3. グループごとに新規コンポが作成され、そこへレイヤーがコピーされる
//
// 判定方法：
//   ① レイヤー単位：各レイヤーのバウンディングボックス（コンプ座標系）を求める
//   ② ピクセル単位：レイヤーの中身を格子状にサンプリングし、前景/背景を判定した上で
//      連結成分（8近傍）ごとにバウンディングボックスを求める
//   いずれの場合も、得られたボックス間の最短距離が「しきい値」以下のものを
//   同一グループとして連結する（Union-Find によるクラスタリング）。
//
// 制限事項：
//   ・判定は現在の再生ヘッド位置（comp.time）で行う
//   ・3Dレイヤーは X/Y と Z回転のみを考慮した簡易的な2D近似
//   ・親子関係が異なるグループにまたがる場合、自動位置調整はスキップされる
//     （警告として一覧表示されるので、該当レイヤーは手動で確認してください）
//   ・Position にエクスプレッションが設定されている場合も自動位置調整はスキップされる
//   ・ピクセル単位モードは、格子状のサンプリング（layer.sampleImage）による近似判定のため、
//     細い線や小さすぎる要素は検出できない場合がある
//   ・ピクセル単位モードで生成されるコンポは「矩形クロップ」であり、検出した形状に沿った
//     マスクは作成されない（余白をしきい値より大きくすると、隣のオブジェクトが写り込む
//     場合があるので注意）
//   ・ピクセル単位モードはサンプリング回数が多いと処理に時間がかかる（数十秒〜数分）
//
// ロジック本体は SplitByDistance.core.js に分離している（Node上でのテスト対象はそちら）。
// このファイルは、AEオブジェクトへの実際のアクセス（プロパティ値の取得、レイヤーの
// コピー・作成、UI）のみを担当する薄いアダプター。

#include "SplitByDistance.core.js"

(function () {

    // ============================================================
    // 定数
    // ============================================================

    var PIXEL_ALPHA_THRESHOLD = 10 / 255;  // これ以下のアルファは背景とみなす
    var PIXEL_COLOR_TOLERANCE = 30 / 255;  // 背景色からのズレがこれを超えたら前景とみなす
    var PIXEL_MAX_SAMPLES     = 20000;     // 1レイヤーあたりのサンプリング上限（超える場合は自動で間隔を広げる）

    // ============================================================
    // ユーティリティ（AEオブジェクトへの実アクセス）
    // ============================================================

    function getActiveComp() {
        var c = app.project.activeItem;
        return (c && c instanceof CompItem) ? c : null;
    }

    function isTargetLayer(layer, includeHidden) {
        if (!(layer instanceof AVLayer)) return false;
        if (layer.nullLayer) return false;
        if (layer.guideLayer) return false;
        if (layer.adjustmentLayer) return false;
        if (!includeHidden && !layer.enabled) return false;
        return true;
    }

    // ── レイヤーのトランスフォーム値取得（言語非依存のショートカットプロパティを使用） ──

    function getAnchorAtTime(layer, time) {
        try { return SplitByDistanceCore.arr3(layer.anchorPoint.valueAtTime(time, false)); } catch (e) { return [0, 0, 0]; }
    }

    function getScaleAtTime(layer, time) {
        try { return SplitByDistanceCore.arr3(layer.scale.valueAtTime(time, false)); } catch (e) { return [100, 100, 100]; }
    }

    function getRotationZAtTime(layer, time) {
        try {
            if (layer.threeDLayer) return layer.rotationZ.valueAtTime(time, false);
            return layer.rotation.valueAtTime(time, false);
        } catch (e) { return 0; }
    }

    function getPositionAtTime(layer, time) {
        try {
            return SplitByDistanceCore.arr3(layer.position.valueAtTime(time, false));
        } catch (e) {
            // Position が Separate Dimensions されている場合
            try {
                var x = layer.xPosition.valueAtTime(time, false);
                var y = layer.yPosition.valueAtTime(time, false);
                var z = 0;
                try { z = layer.zPosition.valueAtTime(time, false); } catch (e2) {}
                return [x, y, z];
            } catch (e3) {
                return [0, 0, 0];
            }
        }
    }

    function isPositionExpressionEnabled(layer) {
        try {
            return layer.position.expressionEnabled;
        } catch (e) {
            try {
                return layer.xPosition.expressionEnabled || layer.yPosition.expressionEnabled;
            } catch (e2) {
                return false;
            }
        }
    }

    // レイヤーとその親チェーンをたどり、SplitByDistanceCore.aabbFromLocalRect等に渡せる
    // 素の配列（AEオブジェクトに依存しない）へ変換する
    function buildTransformChain(layer, time) {
        var chain = [];
        var cur = layer;
        var guard = 0;
        while (cur && guard < 50) {
            guard++;
            chain.push({
                anchor: getAnchorAtTime(cur, time),
                position: getPositionAtTime(cur, time),
                scale: getScaleAtTime(cur, time),
                rotation: getRotationZAtTime(cur, time),
                threeDLayer: !!cur.threeDLayer
            });
            cur = cur.parent;
        }
        return chain;
    }

    // レイヤーのコンプ座標系でのバウンディングボックスを取得（sourceRectAtTime全体）
    function getLayerAabbInComp(layer, time) {
        var rect;
        try { rect = layer.sourceRectAtTime(time, false); } catch (e) { return null; }
        if (!rect) return null;
        var chain = buildTransformChain(layer, time);
        return SplitByDistanceCore.aabbFromLocalRect(chain, {
            left: rect.left, top: rect.top,
            right: rect.left + rect.width, bottom: rect.top + rect.height
        });
    }

    function offsetLayerPosition(layer, offX, offY) {
        try {
            SplitByDistanceCore.shiftVectorProp(layer.position, offX, offY);
        } catch (e) {
            try { SplitByDistanceCore.shiftScalarProp(layer.xPosition, offX); } catch (e1) {}
            try { SplitByDistanceCore.shiftScalarProp(layer.yPosition, offY); } catch (e2) {}
        }
    }

    // ============================================================
    // ピクセル単位モード：画像の中身を解析して離れたオブジェクトを検出
    // ============================================================

    // レイヤーの四隅付近をサンプリングし、背景の色とアルファを推定
    function sampleCornerInfo(layer, rect, time) {
        var inset = Math.min(rect.width, rect.height) * 0.02;
        if (inset < 1) inset = 1;
        var sampleSize = [Math.max(2, inset), Math.max(2, inset)];
        var pts = [
            [rect.left + inset, rect.top + inset],
            [rect.left + rect.width - inset, rect.top + inset],
            [rect.left + inset, rect.top + rect.height - inset],
            [rect.left + rect.width - inset, rect.top + rect.height - inset]
        ];

        var sumR = 0, sumG = 0, sumB = 0, sumA = 0;
        for (var p = 0; p < pts.length; p++) {
            var s;
            try { s = layer.sampleImage(pts[p], sampleSize, true, time); } catch (e) { s = [1, 1, 1, 1]; }
            sumR += s[0]; sumG += s[1]; sumB += s[2]; sumA += s[3];
        }
        return {
            color: [sumR / pts.length, sumG / pts.length, sumB / pts.length],
            alpha: sumA / pts.length
        };
    }

    // レイヤー1枚を解析し、検出したオブジェクトの「レイヤーローカル矩形」の配列を返す
    function detectPixelBlobsForLayer(layer, time, bgMode, requestedStep, progressCb) {
        var rect = layer.sourceRectAtTime(time, false);
        if (!rect || rect.width <= 0 || rect.height <= 0) return [];

        var step = SplitByDistanceCore.computeGridStep(rect.width, rect.height, requestedStep, PIXEL_MAX_SAMPLES);
        var cols = Math.max(1, Math.ceil(rect.width / step));
        var rows = Math.max(1, Math.ceil(rect.height / step));

        var useAlpha = (bgMode === "alpha");
        var bgColor = null;
        if (bgMode === "white") bgColor = [1, 1, 1];
        else if (bgMode === "black") bgColor = [0, 0, 0];

        if (bgMode === "auto" || bgMode === "white" || bgMode === "black") {
            var corner = sampleCornerInfo(layer, rect, time);
            if (bgMode === "auto") {
                useAlpha = corner.alpha < 0.5;
                if (!useAlpha) bgColor = corner.color;
            } else if (corner.alpha < 0.5) {
                // white/black指定でも、実際には透明な背景ならアルファ判定を優先する
                useAlpha = true;
            }
        }

        var classifyOpts = {
            useAlpha: useAlpha,
            bgColor: bgColor,
            alphaThreshold: PIXEL_ALPHA_THRESHOLD,
            colorTolerance: PIXEL_COLOR_TOLERANCE
        };

        var fg = [];
        var total = cols * rows;
        var count = 0;

        for (var j = 0; j < rows; j++) {
            for (var i = 0; i < cols; i++) {
                var cx = rect.left + i * step + step / 2;
                var cy = rect.top + j * step + step / 2;
                var samp;
                try { samp = layer.sampleImage([cx, cy], [step, step], true, time); }
                catch (eS) { samp = [0, 0, 0, 0]; }

                fg[j * cols + i] = SplitByDistanceCore.classifySample(samp, classifyOpts);

                count++;
                if (progressCb && (count % 200 === 0 || count === total)) progressCb(count, total);
            }
        }

        return SplitByDistanceCore.blobsFromForegroundGrid(fg, cols, rows, rect, step);
    }

    // ============================================================
    // UI
    // ============================================================

    var dlg = new Window("palette", "Split By Distance", undefined, { resizeable: false });
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "top"];
    dlg.spacing = 10;
    dlg.margins = [14, 14, 14, 14];

    var lblDesc = dlg.add("statictext", undefined, "離れたオブジェクトをグループごとに別コンポへ分割します。", { multiline: false });

    // ── 検出モード ──
    var secMode = dlg.add("panel", undefined, "  検出モード");
    secMode.orientation = "column";
    secMode.alignChildren = ["fill", "top"];
    secMode.margins = [10, 14, 10, 10];
    secMode.spacing = 5;

    var rdModeLayer = secMode.add("radiobutton", undefined, "レイヤー単位（複数レイヤーを位置でグループ化）");
    var rdModePixel = secMode.add("radiobutton", undefined, "ピクセル単位（1枚の画像を自動解析）");
    rdModeLayer.value = true;

    // ── 対象 ──
    var secTarget = dlg.add("panel", undefined, "  対象");
    secTarget.orientation = "column";
    secTarget.alignChildren = ["fill", "top"];
    secTarget.margins = [10, 14, 10, 10];
    secTarget.spacing = 5;

    var chkSelectedOnly = secTarget.add("checkbox", undefined, "選択レイヤーのみを対象にする");
    var chkIncludeHidden = secTarget.add("checkbox", undefined, "非表示レイヤーを含める");
    chkSelectedOnly.value = false;
    chkIncludeHidden.value = false;

    // ── ピクセル検出設定（ピクセル単位モードの時のみ使用） ──
    var secPixel = dlg.add("panel", undefined, "  ピクセル検出設定");
    secPixel.orientation = "column";
    secPixel.alignChildren = ["fill", "top"];
    secPixel.margins = [10, 14, 10, 10];
    secPixel.spacing = 5;

    var lblBg = secPixel.add("statictext", undefined, "背景の判定方法：");
    var rdBgAuto  = secPixel.add("radiobutton", undefined, "自動（アルファ優先／なければ背景色を推定）");
    var rdBgAlpha = secPixel.add("radiobutton", undefined, "アルファチャンネル（透明部分）");
    var rdBgWhite = secPixel.add("radiobutton", undefined, "白背景");
    var rdBgBlack = secPixel.add("radiobutton", undefined, "黒背景");
    rdBgAuto.value = true;

    var rowGrid = secPixel.add("group");
    rowGrid.alignment = "fill";
    rowGrid.add("statictext", undefined, "解析グリッド間隔 (px)：");
    var txtGridStep = rowGrid.add("edittext", undefined, "8");
    txtGridStep.characters = 6;
    txtGridStep.helpTip = "小さいほど精密ですが処理が遅くなります";

    var lblProgress = secPixel.add("statictext", undefined, "");
    lblProgress.characters = 40;

    function updatePixelPanelEnabled() {
        var on = rdModePixel.value;
        secPixel.enabled = on;
        chkSelectedOnly.value = on ? true : chkSelectedOnly.value;
        chkSelectedOnly.enabled = !on;
    }
    rdModeLayer.onClick = updatePixelPanelEnabled;
    rdModePixel.onClick = updatePixelPanelEnabled;
    updatePixelPanelEnabled();

    // ── 分割設定 ──
    var secSplit = dlg.add("panel", undefined, "  分割設定");
    secSplit.orientation = "column";
    secSplit.alignChildren = ["fill", "top"];
    secSplit.margins = [10, 14, 10, 10];
    secSplit.spacing = 6;

    var rowThresh = secSplit.add("group");
    rowThresh.alignment = "fill";
    rowThresh.add("statictext", undefined, "しきい値 (px)：");
    var txtThreshold = rowThresh.add("edittext", undefined, "80");
    txtThreshold.characters = 6;

    var rowMargin = secSplit.add("group");
    rowMargin.alignment = "fill";
    rowMargin.add("statictext", undefined, "余白 (px)：");
    var txtMargin = rowMargin.add("edittext", undefined, "40");
    txtMargin.characters = 6;

    var rowPrefix = secSplit.add("group");
    rowPrefix.alignment = "fill";
    rowPrefix.add("statictext", undefined, "コンプ名の接頭辞：");
    var txtPrefix = rowPrefix.add("edittext", undefined, "");
    txtPrefix.characters = 16;
    txtPrefix.helpTip = "空欄の場合はアクティブコンプ名を使用します";

    var chkFolder = secSplit.add("checkbox", undefined, "生成したコンポをフォルダにまとめる");
    chkFolder.value = true;

    // ── オプション ──
    var secOpt = dlg.add("panel", undefined, "  オプション");
    secOpt.orientation = "column";
    secOpt.alignChildren = ["fill", "top"];
    secOpt.margins = [10, 14, 10, 10];
    secOpt.spacing = 5;

    var chkDelete = secOpt.add("checkbox", undefined, "元レイヤーを削除する（移動モード）");
    chkDelete.value = false;
    chkDelete.helpTip = "OFF: 元コンポのレイヤーはそのまま残ります（複製）\nON: 新規コンポへコピー後、元レイヤーを削除します（移動）";

    // ── 実行 / 閉じる ──
    var runGroup = dlg.add("group");
    runGroup.alignment = "fill";
    runGroup.spacing = 8;
    var btnRun = runGroup.add("button", undefined, "実行");
    var btnClose = runGroup.add("button", undefined, "閉じる");

    // ============================================================
    // メイン処理
    // ============================================================

    btnRun.onClick = function () {
        var comp = getActiveComp();
        if (!comp) { alert("アクティブなコンポジションを開いてください。"); return; }

        var threshold = parseFloat(txtThreshold.text);
        if (isNaN(threshold) || threshold < 0) { alert("しきい値には0以上の数値を入力してください。"); return; }

        var margin = parseFloat(txtMargin.text);
        if (isNaN(margin) || margin < 0) { alert("余白には0以上の数値を入力してください。"); return; }

        var includeHidden = chkIncludeHidden.value;
        var pixelMode = rdModePixel.value;
        var time = comp.time;

        var items = []; // {layer, index, box, used3D}
        var skipped = [];

        if (pixelMode) {
            // ── ピクセル単位モード：選択レイヤーを解析 ──
            var sel = comp.selectedLayers;
            if (!sel || sel.length === 0) { alert("ピクセル単位モードでは、解析するレイヤーを選択してください。"); return; }

            var pixelCandidates = [];
            for (var s0 = 0; s0 < sel.length; s0++) {
                if (isTargetLayer(sel[s0], includeHidden)) pixelCandidates.push(sel[s0]);
            }
            if (pixelCandidates.length === 0) { alert("対象になるレイヤーが見つかりませんでした。"); return; }

            var gridStepInput = parseFloat(txtGridStep.text);
            if (isNaN(gridStepInput) || gridStepInput < 1) { alert("解析グリッド間隔には1以上の数値を入力してください。"); return; }

            var bgMode = "auto";
            if (rdBgAlpha.value) bgMode = "alpha";
            else if (rdBgWhite.value) bgMode = "white";
            else if (rdBgBlack.value) bgMode = "black";

            // 事前見積もり（サンプル数）
            var estTotal = 0;
            for (var e = 0; e < pixelCandidates.length; e++) {
                var r0 = pixelCandidates[e].sourceRectAtTime(time, false);
                if (!r0 || r0.width <= 0 || r0.height <= 0) continue;
                var st0 = SplitByDistanceCore.computeGridStep(r0.width, r0.height, gridStepInput, PIXEL_MAX_SAMPLES);
                estTotal += Math.ceil(r0.width / st0) * Math.ceil(r0.height / st0);
            }

            var proceedPixel = confirm(
                "【Split By Distance：ピクセル解析】\n" +
                "対象レイヤー数: " + pixelCandidates.length + "\n" +
                "推定サンプル数: 約" + estTotal + "\n\n" +
                "画像の内容によっては解析に数十秒〜数分かかる場合があります。\n続行しますか？"
            );
            if (!proceedPixel) return;

            for (var pc = 0; pc < pixelCandidates.length; pc++) {
                var pLayer = pixelCandidates[pc];
                lblProgress.text = "解析中: " + pLayer.name;
                dlg.update();

                var blobs = detectPixelBlobsForLayer(pLayer, time, bgMode, gridStepInput, function (done, total) {
                    lblProgress.text = "解析中: " + pLayer.name + " (" + done + " / " + total + ")";
                    dlg.update();
                });

                if (blobs.length === 0) {
                    skipped.push(pLayer.name + "（検出0件）");
                    continue;
                }
                for (var bb = 0; bb < blobs.length; bb++) {
                    var chain = buildTransformChain(pLayer, time);
                    var aabb = SplitByDistanceCore.aabbFromLocalRect(chain, blobs[bb]);
                    items.push({ layer: pLayer, index: pLayer.index, box: aabb, used3D: aabb.used3D });
                }
            }
            lblProgress.text = "";

            if (items.length === 0) { alert("オブジェクトを検出できませんでした。背景の判定方法やグリッド間隔を見直してください。"); return; }

        } else {
            // ── レイヤー単位モード（既存の複数レイヤーで判定） ──
            var selectedOnly = chkSelectedOnly.value;
            var candidates = [];
            if (selectedOnly) {
                var selL = comp.selectedLayers;
                if (!selL || selL.length === 0) { alert("レイヤーが選択されていません。\n先に対象レイヤーを選択するか、「選択レイヤーのみを対象にする」のチェックを外してください。"); return; }
                for (var s = 0; s < selL.length; s++) {
                    if (isTargetLayer(selL[s], includeHidden)) candidates.push(selL[s]);
                }
            } else {
                for (var li = 1; li <= comp.numLayers; li++) {
                    var l = comp.layer(li);
                    if (isTargetLayer(l, includeHidden)) candidates.push(l);
                }
            }

            if (candidates.length === 0) { alert("対象になるレイヤーが見つかりませんでした。\n（Null / ガイド / 調整レイヤーは対象外です）"); return; }

            for (var c = 0; c < candidates.length; c++) {
                var lyr = candidates[c];
                var box = getLayerAabbInComp(lyr, time);
                if (!box) { skipped.push(lyr.name); continue; }
                items.push({ layer: lyr, index: lyr.index, box: box, used3D: box.used3D });
            }

            if (items.length === 0) { alert("バウンディングボックスを取得できるレイヤーがありませんでした。"); return; }
        }

        // ── クラスタリング（Union-Find） ──
        var boxes = [];
        for (var bi = 0; bi < items.length; bi++) boxes.push(items[bi].box);
        var clusters = SplitByDistanceCore.clusterByDistance(boxes, threshold);

        // ── 確認 ──
        var modeLabel = chkDelete.value ? "移動（元レイヤーは削除されます）" : "複製（元レイヤーは残ります）";
        var proceed = confirm(
            "【Split By Distance】\n" +
            "検出オブジェクト数: " + items.length + (skipped.length ? "（除外 " + skipped.length + "件）" : "") + "\n" +
            "検出グループ数: " + clusters.length + "\n" +
            "しきい値: " + threshold + "px / 余白: " + margin + "px\n" +
            "モード: " + modeLabel + "\n\n" +
            "続行しますか？"
        );
        if (!proceed) return;

        var prefix = (txtPrefix.text && txtPrefix.text.replace(/^\s+|\s+$/g, "") !== "") ? txtPrefix.text.replace(/^\s+|\s+$/g, "") : comp.name;
        var digits = SplitByDistanceCore.digitsForCount(clusters.length);

        var warnings = [];
        var toDelete = [];
        var createdComps = 0;

        app.beginUndoGroup("Split By Distance");
        try {
            var targetFolder = null;
            if (chkFolder.value) {
                targetFolder = app.project.items.addFolder(prefix + " - Split");
            }

            for (var idx = 0; idx < clusters.length; idx++) {
                var clusterItemIdxs = clusters[idx];

                var ub = SplitByDistanceCore.unionBox(boxes, clusterItemIdxs);
                var layout = SplitByDistanceCore.computeCompLayout(ub, margin, 30000);

                var compName = SplitByDistanceCore.buildCompName(prefix, idx + 1, digits);
                var newComp = app.project.items.addComp(compName, layout.width, layout.height, comp.pixelAspect, comp.duration, comp.frameRate);
                newComp.bgColor = comp.bgColor;
                if (targetFolder) newComp.parentFolder = targetFolder;

                // クラスタ内で参照されているレイヤーを重複なく、元のスタック順で集める
                // （ピクセル単位モードでは、同じ画像から複数オブジェクトが同じクラスタに
                // 含まれることがあるため、レイヤー自体は1回だけコピーする）
                var uniqueIndexes = SplitByDistanceCore.uniqueIndexesDescending(clusterItemIdxs, items);
                var layerByIndex = {};
                for (var u2 = 0; u2 < clusterItemIdxs.length; u2++) {
                    var itm = items[clusterItemIdxs[u2]];
                    layerByIndex[itm.index] = itm.layer;
                }

                for (var si = 0; si < uniqueIndexes.length; si++) {
                    var srcLayer = layerByIndex[uniqueIndexes[si]];

                    if (srcLayer.threeDLayer) {
                        warnings.push(srcLayer.name + "：3Dレイヤーのため簡易的な2D近似で計算しています。位置を確認してください。");
                    }

                    srcLayer.copyToComp(newComp);
                    var newLayer = newComp.layer(1);

                    var hasParent = false;
                    try { hasParent = !!newLayer.parent; } catch (eP) { hasParent = false; }

                    if (hasParent) {
                        warnings.push(srcLayer.name + "：親レイヤーが設定されているため自動位置調整をスキップしました。ズレを確認してください。");
                    } else if (isPositionExpressionEnabled(newLayer)) {
                        warnings.push(srcLayer.name + "：Position にエクスプレッションが設定されているため自動位置調整をスキップしました。");
                    } else {
                        offsetLayerPosition(newLayer, layout.offsetX, layout.offsetY);
                    }

                    if (chkDelete.value) toDelete.push(srcLayer);
                }

                newComp.selected = true;
                createdComps++;
            }

            // 移動モード：元レイヤーを削除（全コピー完了後にまとめて実行、重複参照は除外）
            // ※ index等の値ではなく、オブジェクト参照そのもので重複判定する
            //   （削除が進むと他レイヤーのindexが変動するため、値ベースの比較は不正確になる）
            if (chkDelete.value) {
                var deletedLayers = [];
                for (var d = 0; d < toDelete.length; d++) {
                    var dl = toDelete[d];
                    var already = false;
                    for (var dd = 0; dd < deletedLayers.length; dd++) {
                        if (deletedLayers[dd] === dl) { already = true; break; }
                    }
                    if (already) continue;
                    deletedLayers.push(dl);
                    try { dl.remove(); } catch (eD) {}
                }
            }
        } finally {
            app.endUndoGroup();
        }

        var msg = "✅ 完了しました。\n\n" +
            "検出グループ数: " + clusters.length + "\n" +
            "作成したコンポ数: " + createdComps + "\n" +
            "検出オブジェクト数: " + items.length +
            (skipped.length ? "\n除外: " + skipped.length + "件" : "");

        if (warnings.length > 0) {
            var shown = warnings.length > 15 ? warnings.slice(0, 15) : warnings;
            msg += "\n\n⚠ 要確認 (" + warnings.length + "件):\n" + shown.join("\n");
            if (warnings.length > shown.length) msg += "\n…他 " + (warnings.length - shown.length) + "件";
        }

        alert(msg);
    };

    btnClose.onClick = function () { dlg.close(); };

    dlg.center();
    dlg.show();

})();
