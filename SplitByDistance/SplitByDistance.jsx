// SplitByDistance.jsx
// 距離ベースのレイヤー自動分割ツール v2
//
// 概要：
//   コンポ内に散らばって配置されたレイヤー（添付画像のような、離れた図形の集合）を
//   「近くにあるもの同士」でグループ化し、グループ（＝離れたオブジェクト）ごとに
//   新規コンポジションへ自動で振り分けるスクリプト。
//
//   検出モードは3種類：
//     ① レイヤー単位：コンプ内の既存の複数レイヤーを、それぞれの位置で判定
//     ② マスク単位：1枚の画像（1レイヤー）に付けられた複数のマスクを、
//        マスクごとに1オブジェクトとして扱う（AE純正の「オートトレース」で
//        離れた図形を自動でマスク化してから使う）
//     ③ ピクセル単位：1枚のPNG画像（1レイヤー）の中身をNode.jsで解析し、
//        アルファ（透明部分）または背景色（白 / 黒 / 自動判定）をもとに
//        「離れたオブジェクト」を自動検出する（実験的・非推奨。②が使えない
//        特殊なケース向け。まずは②を試してください）
//
// 使い方：
//   1. 対象コンポを開く（必要なら対象レイヤーを選択）
//   2. 検出モードを選び、しきい値・余白などを設定して [実行]
//   3. グループごとに新規コンポが作成され、そこへレイヤーがコピーされる
//
// 判定方法：
//   ① レイヤー単位：各レイヤーのバウンディングボックス（コンプ座標系）を求める
//   ② マスク単位：選択レイヤーの各マスクのパス頂点からバウンディングボックスを求める。
//      コピー先のコンポでは、そのマスク以外は無効化されるため、検出した形状の輪郭で
//      正確にクロップされる（矩形クロップではない）
//   ③ ピクセル単位：画像ファイルをNode.js（detect-objects.js）に渡してピクセル単位で
//      解析し、連結成分（8近傍）ごとにバウンディングボックスを求める
//   いずれの場合も、得られたボックス間の最短距離が「しきい値」以下のものを
//   同一グループとして連結する（Union-Find によるクラスタリング）。
//
// マスク単位モードの前提：
//   ・対象レイヤーに、離れた図形ごとの有効なマスク（反転していない、モードがNone以外）が
//     付いていること。1枚の画像から複数の離れた図形を検出したい場合は、あらかじめ
//     レイヤーを選択して メニュー → レイヤー → オートトレース... を実行し、
//     チャンネル=アルファ 等の設定でマスクを自動生成しておく
//
// ピクセル単位モードの必須条件（実験的機能）：
//   ・Node.js がインストールされていて、コマンドラインから node が実行できること
//     （インストールされていない場合は https://nodejs.org/ から）
//   ・対象レイヤーが PNG 画像ファイルから読み込まれたフッテージであること
//     （シェイプレイヤー・テキストレイヤー・プリコンプ・JPEG/PSD等は非対応）
//   ・After Effects の環境設定 > スクリプトとエクスプレッション で
//     「スクリプトによるファイルへの書き込みとネットワークへのアクセスを許可」が
//     オンになっていること（外部コマンド実行に必要）
//
// 制限事項：
//   ・判定は現在の再生ヘッド位置（comp.time）で行う
//   ・3Dレイヤーは X/Y と Z回転のみを考慮した簡易的な2D近似
//   ・親子関係が異なるグループにまたがる場合、自動位置調整はスキップされる
//     （警告として一覧表示されるので、該当レイヤーは手動で確認してください）
//   ・Position にエクスプレッションが設定されている場合も自動位置調整はスキップされる
//   ・ピクセル単位モードで生成されるコンポは「矩形クロップ」であり、検出した形状に沿った
//     マスクは作成されない（余白をしきい値より大きくすると、隣のオブジェクトが写り込む
//     場合があるので注意）。マスク単位モードにはこの制限はない。
//
// ロジック本体は SplitByDistance.core.js に分離している（Node上でのテスト対象はそちら）。
// このファイルは、AEオブジェクトへの実際のアクセス（プロパティ値の取得、レイヤーの
// コピー・作成、外部コマンドの呼び出し、UI）のみを担当する薄いアダプター。

#include "SplitByDistance.core.js"

(function () {

    // ============================================================
    // 定数
    // ============================================================

    var PIXEL_MIN_BLOB_AREA = 4; // これ未満の面積(px^2)の検出はノイズとして除外

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
    // マスク単位モード：レイヤーの各マスクをオブジェクトとして扱う
    // ============================================================

    // レイヤーの使えるマスク（反転していないもの）を列挙し、それぞれのバウンディング
    // ボックス（レイヤーローカル座標系）を返す。
    // ※ オートトレースが作るマスクは、既定でモードが「なし」のまま作成される
    //   （画像全体をいきなり隠さないための仕様）。そのため、モードが「なし」でも
    //   形状データとしては有効なものとして扱う（除外しない）。
    // 戻り値: [{ maskIndex, rect }, ...]（maskIndexは1始まり、ADBE Mask Parade内の順序）
    function getLayerMaskRects(layer, time) {
        var results = [];
        var maskGroup;
        try { maskGroup = layer.property("ADBE Mask Parade"); } catch (e) { return results; }
        if (!maskGroup) return results;

        for (var i = 1; i <= maskGroup.numProperties; i++) {
            try {
                var m = maskGroup.property(i);
                if (m.inverted) continue;

                var shapeProp = m.property("ADBE Mask Shape");
                var shape = shapeProp.valueAtTime(time, false);
                var verts = shape ? shape.vertices : null;
                if (!verts || verts.length === 0) continue;

                results.push({ maskIndex: i, rect: SplitByDistanceCore.bboxFromVertices(verts) });
            } catch (eM) {}
        }
        return results;
    }

    // newLayer上のマスクのうち、keepIndexesに含まれるものだけを実際にクロップに使う
    // （モードを「加算」にして有効化）。それ以外は「なし」にして無効化する。
    // （コピー元と同じ並び・数のマスクが複製されている前提）
    function disableMasksExcept(newLayer, keepIndexes) {
        var keepSet = {};
        for (var k = 0; k < keepIndexes.length; k++) keepSet[keepIndexes[k]] = true;

        var maskGroup;
        try { maskGroup = newLayer.property("ADBE Mask Parade"); } catch (e) { return; }
        if (!maskGroup) return;

        for (var i = 1; i <= maskGroup.numProperties; i++) {
            try {
                maskGroup.property(i).maskMode = keepSet[i] ? MaskMode.ADD : MaskMode.NONE;
            } catch (eD) {}
        }
    }

    // ============================================================
    // ピクセル単位モード：画像ファイルをNode.jsに渡して解析する
    // ============================================================

    // レイヤーの元画像ファイル（File）を返す。フッテージ由来でなければ null。
    function getSourceImageFile(layer) {
        try {
            if (layer.source && layer.source.file) return layer.source.file;
        } catch (e) {}
        return null;
    }

    // このスクリプト自身と同じフォルダにあるファイルを指す File を返す
    function findNeighborFile(name) {
        var thisFile = new File($.fileName);
        return new File(thisFile.parent.fsName + "/" + name);
    }

    function quoteForShell(pathStr) {
        return '"' + pathStr.replace(/"/g, '\\"') + '"';
    }

    // detect-objects.js を実行し、検出結果を返す。失敗時は例外をthrowする。
    // 戻り値: { width, height, blobs:[{left,top,right,bottom}, ...] }（座標は画像のピクセル座標系）
    function runPixelDetection(imageFile, bgMode) {
        var scriptFile = findNeighborFile("detect-objects.js");
        if (!scriptFile.exists) {
            throw new Error("detect-objects.js が見つかりません。SplitByDistance.jsx と同じフォルダに配置してください。\n(" + scriptFile.fsName + ")");
        }

        var outFile = new File(Folder.temp.fsName + "/sbd_detect_" + Date.now() + "_" + Math.floor(Math.random() * 1e6) + ".json");

        var cmd = "node " + quoteForShell(scriptFile.fsName) + " " + quoteForShell(imageFile.fsName) + " " +
            quoteForShell(outFile.fsName) + " --bg=" + bgMode + " --minArea=" + PIXEL_MIN_BLOB_AREA;

        var output;
        try {
            output = system.callSystem(cmd);
        } catch (eCall) {
            throw new Error(
                "外部コマンドの実行に失敗しました。\n\n" +
                "After Effects の環境設定 > スクリプトとエクスプレッション で\n" +
                "「スクリプトによるファイルへの書き込みとネットワークへのアクセスを許可」が\n" +
                "オンになっているか確認してください。\n\n詳細: " + eCall.toString()
            );
        }

        if (!outFile.exists) {
            throw new Error(
                "検出結果のファイルが作成されませんでした。Node.js がインストールされているか確認してください\n" +
                "（コマンドプロンプトで node --version を実行して確認できます。\n" +
                "未インストールの場合は https://nodejs.org/ から入手してください）。\n\n" +
                "コマンドの出力:\n" + (output || "(出力なし)")
            );
        }

        var json;
        try {
            outFile.encoding = "UTF-8";
            outFile.open("r");
            var text = outFile.read();
            outFile.close();
            json = JSON.parse(text);
        } catch (eParse) {
            throw new Error("検出結果の読み込みに失敗しました：" + eParse.toString());
        } finally {
            try { outFile.remove(); } catch (eRm) {}
        }

        return json;
    }

    // 画像のピクセル座標系の矩形を、レイヤーローカル座標系の矩形へ変換
    // （sourceRectAtTime の範囲に対して比例配分する。通常は等倍になる）
    function pixelRectToLayerLocalRect(pixelRect, imgWidth, imgHeight, sourceRect) {
        var sx = imgWidth > 0 ? (sourceRect.width / imgWidth) : 1;
        var sy = imgHeight > 0 ? (sourceRect.height / imgHeight) : 1;
        return {
            left: sourceRect.left + pixelRect.left * sx,
            top: sourceRect.top + pixelRect.top * sy,
            right: sourceRect.left + pixelRect.right * sx,
            bottom: sourceRect.top + pixelRect.bottom * sy
        };
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
    var rdModeMask  = secMode.add("radiobutton", undefined, "マスク単位（1枚の画像のマスクごとに分割・おすすめ）");
    var rdModePixel = secMode.add("radiobutton", undefined, "ピクセル単位（1枚の画像を自動解析・実験的機能）");
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

    // ── 背景の判定方法（ピクセル単位モードの時のみ使用） ──
    var secPixel = dlg.add("panel", undefined, "  背景の判定方法（ピクセル単位モードのみ）");
    secPixel.orientation = "column";
    secPixel.alignChildren = ["fill", "top"];
    secPixel.margins = [10, 14, 10, 10];
    secPixel.spacing = 5;

    var rdBgAuto  = secPixel.add("radiobutton", undefined, "自動（おすすめ）");
    var rdBgAlpha = secPixel.add("radiobutton", undefined, "アルファチャンネル（透明部分）");
    var rdBgWhite = secPixel.add("radiobutton", undefined, "白背景");
    var rdBgBlack = secPixel.add("radiobutton", undefined, "黒背景");
    rdBgAuto.value = true;

    var lblProgress = secPixel.add("statictext", undefined, "");
    lblProgress.characters = 40;

    // ── 分割の基準（メイン設定） ──
    var secSplit = dlg.add("panel", undefined, "  分割の基準");
    secSplit.orientation = "column";
    secSplit.alignChildren = ["fill", "top"];
    secSplit.margins = [10, 14, 10, 10];
    secSplit.spacing = 3;

    var rowThresh = secSplit.add("group");
    rowThresh.alignment = "fill";
    rowThresh.add("statictext", undefined, "オブジェクト同士のすき間 (px)：");
    var txtThreshold = rowThresh.add("edittext", undefined, "80");
    txtThreshold.characters = 6;
    secSplit.add("statictext", undefined, "この距離より離れていたら、別々のコンポに分けます。", { multiline: true });

    var rowMargin = secSplit.add("group");
    rowMargin.alignment = "fill";
    rowMargin.add("statictext", undefined, "コンポの余白 (px)：");
    var txtMargin = rowMargin.add("edittext", undefined, "40");
    txtMargin.characters = 6;
    secSplit.add("statictext", undefined, "各コンポの周りに残す余白です。", { multiline: true });

    // ── 詳細設定（折りたたみ） ──
    var chkAdvanced = dlg.add("checkbox", undefined, "詳細設定を表示");
    chkAdvanced.value = false;

    var secAdvanced = dlg.add("panel", undefined, "  詳細設定");
    secAdvanced.orientation = "column";
    secAdvanced.alignChildren = ["fill", "top"];
    secAdvanced.margins = [10, 14, 10, 10];
    secAdvanced.spacing = 6;

    var rowPrefix = secAdvanced.add("group");
    rowPrefix.alignment = "fill";
    rowPrefix.add("statictext", undefined, "コンプ名の接頭辞：");
    var txtPrefix = rowPrefix.add("edittext", undefined, "");
    txtPrefix.characters = 16;
    txtPrefix.helpTip = "空欄の場合はアクティブコンプ名を使用します";

    var chkFolder = secAdvanced.add("checkbox", undefined, "生成したコンポをフォルダにまとめる");
    chkFolder.value = true;

    var chkDelete = secAdvanced.add("checkbox", undefined, "元レイヤーを削除する（移動モード）");
    chkDelete.value = false;
    chkDelete.helpTip = "OFF: 元コンポのレイヤーはそのまま残ります（複製）\nON: 新規コンポへコピー後、元レイヤーを削除します（移動）";

    secAdvanced.visible = false;
    chkAdvanced.onClick = function () {
        secAdvanced.visible = chkAdvanced.value;
        dlg.layout.layout(true);
    };

    function updateModeUI() {
        var needsSelection = rdModePixel.value || rdModeMask.value;
        secPixel.enabled = rdModePixel.value;
        chkSelectedOnly.value = needsSelection ? true : chkSelectedOnly.value;
        chkSelectedOnly.enabled = !needsSelection;
    }
    rdModeLayer.onClick = updateModeUI;
    rdModeMask.onClick = updateModeUI;
    rdModePixel.onClick = updateModeUI;
    updateModeUI();

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
        var mode = rdModePixel.value ? "pixel" : (rdModeMask.value ? "mask" : "layer");
        var time = comp.time;

        var items = []; // {layer, index, box, used3D, maskIndex?}
        var skipped = [];

        if (mode === "pixel") {
            // ── ピクセル単位モード：選択レイヤーを解析（Node.jsの detect-objects.js に委譲） ──
            var sel = comp.selectedLayers;
            if (!sel || sel.length === 0) { alert("ピクセル単位モードでは、解析するレイヤーを選択してください。"); return; }

            var pixelCandidates = [];
            var invalidLayers = [];
            for (var s0 = 0; s0 < sel.length; s0++) {
                var candLayer = sel[s0];
                if (!isTargetLayer(candLayer, includeHidden)) continue;
                var srcFile = getSourceImageFile(candLayer);
                if (!srcFile || !/\.png$/i.test(srcFile.fsName)) {
                    invalidLayers.push(candLayer.name);
                    continue;
                }
                pixelCandidates.push({ layer: candLayer, file: srcFile });
            }

            if (pixelCandidates.length === 0) {
                alert(
                    "対象になるレイヤーが見つかりませんでした。\n\n" +
                    "ピクセル単位モードは、PNG画像ファイルから読み込んだレイヤーのみに対応しています" +
                    "（シェイプレイヤー、テキストレイヤー、プリコンプ、JPEG/PSD等は非対応です）。" +
                    (invalidLayers.length ? "\n\n対象外のレイヤー: " + invalidLayers.join(", ") : "")
                );
                return;
            }

            var bgMode = "auto";
            if (rdBgAlpha.value) bgMode = "alpha";
            else if (rdBgWhite.value) bgMode = "white";
            else if (rdBgBlack.value) bgMode = "black";

            var pixelDiagnostics = [];

            for (var pc = 0; pc < pixelCandidates.length; pc++) {
                var pLayer = pixelCandidates[pc].layer;
                var pFile = pixelCandidates[pc].file;

                lblProgress.text = "解析中: " + pLayer.name;
                dlg.update();

                var detectResult;
                try {
                    detectResult = runPixelDetection(pFile, bgMode);
                } catch (eDetect) {
                    lblProgress.text = "";
                    alert("ピクセル解析でエラーが発生しました（" + pLayer.name + "）：\n\n" + eDetect.message);
                    return;
                }

                if (!detectResult.blobs || detectResult.blobs.length === 0) {
                    skipped.push(pLayer.name + "（検出0件）");
                    continue;
                }

                // 診断情報：実際に使われた背景判定方法と、検出範囲の合計（画像全体との比較用）
                var pxUnion = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
                for (var db = 0; db < detectResult.blobs.length; db++) {
                    var dbx = detectResult.blobs[db];
                    if (dbx.left < pxUnion.left) pxUnion.left = dbx.left;
                    if (dbx.top < pxUnion.top) pxUnion.top = dbx.top;
                    if (dbx.right > pxUnion.right) pxUnion.right = dbx.right;
                    if (dbx.bottom > pxUnion.bottom) pxUnion.bottom = dbx.bottom;
                }
                pixelDiagnostics.push(
                    pLayer.name + "：背景判定=" + (detectResult.useAlpha ? "アルファ" : "色" +
                        (detectResult.bgColor ? "(R" + Math.round(detectResult.bgColor[0] * 255) +
                            " G" + Math.round(detectResult.bgColor[1] * 255) +
                            " B" + Math.round(detectResult.bgColor[2] * 255) + ")" : "")) +
                    " / 画像サイズ=" + detectResult.width + "x" + detectResult.height +
                    " / 検出数=" + detectResult.blobs.length +
                    " / 検出範囲=(" + pxUnion.left + "," + pxUnion.top + ")-(" + pxUnion.right + "," + pxUnion.bottom + ")"
                );

                var srcRect = pLayer.sourceRectAtTime(time, false);
                for (var bb = 0; bb < detectResult.blobs.length; bb++) {
                    var localRect = pixelRectToLayerLocalRect(detectResult.blobs[bb], detectResult.width, detectResult.height, {
                        left: srcRect.left, top: srcRect.top, width: srcRect.width, height: srcRect.height
                    });
                    var chain = buildTransformChain(pLayer, time);
                    var aabb = SplitByDistanceCore.aabbFromLocalRect(chain, localRect);
                    items.push({ layer: pLayer, index: pLayer.index, box: aabb, used3D: aabb.used3D });
                }
            }
            lblProgress.text = "";

            if (items.length === 0) { alert("オブジェクトを検出できませんでした。背景の判定方法を見直してください。"); return; }

            if (pixelDiagnostics.length > 0) {
                alert("【診断情報】\n" + pixelDiagnostics.join("\n"));
            }

        } else if (mode === "mask") {
            // ── マスク単位モード：選択レイヤーの各マスクを1オブジェクトとして扱う ──
            var selM = comp.selectedLayers;
            if (!selM || selM.length === 0) { alert("マスク単位モードでは、対象レイヤーを選択してください。"); return; }

            var maskCandidates = [];
            for (var sm = 0; sm < selM.length; sm++) {
                if (isTargetLayer(selM[sm], includeHidden)) maskCandidates.push(selM[sm]);
            }
            if (maskCandidates.length === 0) { alert("対象になるレイヤーが見つかりませんでした。"); return; }

            for (var mc = 0; mc < maskCandidates.length; mc++) {
                var mLayer = maskCandidates[mc];
                var maskRects = getLayerMaskRects(mLayer, time);

                if (maskRects.length === 0) {
                    skipped.push(mLayer.name + "（有効なマスクなし）");
                    continue;
                }

                var chainM = buildTransformChain(mLayer, time);
                for (var mr = 0; mr < maskRects.length; mr++) {
                    var aabbM = SplitByDistanceCore.aabbFromLocalRect(chainM, maskRects[mr].rect);
                    items.push({ layer: mLayer, index: mLayer.index, box: aabbM, used3D: aabbM.used3D, maskIndex: maskRects[mr].maskIndex });
                }
            }

            if (items.length === 0) {
                alert(
                    "有効なマスクを持つレイヤーが見つかりませんでした。\n\n" +
                    "先に対象レイヤーを選択して メニュー → レイヤー → オートトレース... を実行し、" +
                    "マスクを作成してから実行してください。"
                );
                return;
            }

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
                // （ピクセル単位／マスク単位モードでは、同じレイヤーから複数オブジェクトが
                // 同じクラスタに含まれることがあるため、レイヤー自体は1回だけコピーする）
                var uniqueIndexes = SplitByDistanceCore.uniqueIndexesDescending(clusterItemIdxs, items);
                var layerByIndex = {};
                var maskIndexesByLayerIndex = {}; // マスク単位モードでのみ使用
                for (var u2 = 0; u2 < clusterItemIdxs.length; u2++) {
                    var itm = items[clusterItemIdxs[u2]];
                    layerByIndex[itm.index] = itm.layer;
                    if (itm.maskIndex !== undefined) {
                        if (!maskIndexesByLayerIndex[itm.index]) maskIndexesByLayerIndex[itm.index] = [];
                        maskIndexesByLayerIndex[itm.index].push(itm.maskIndex);
                    }
                }

                for (var si = 0; si < uniqueIndexes.length; si++) {
                    var srcLayer = layerByIndex[uniqueIndexes[si]];

                    if (srcLayer.threeDLayer) {
                        warnings.push(srcLayer.name + "：3Dレイヤーのため簡易的な2D近似で計算しています。位置を確認してください。");
                    }

                    srcLayer.copyToComp(newComp);
                    var newLayer = newComp.layer(1);

                    if (mode === "mask") {
                        disableMasksExcept(newLayer, maskIndexesByLayerIndex[uniqueIndexes[si]] || []);
                    }

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
