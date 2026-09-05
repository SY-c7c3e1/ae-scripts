// SplitByDistance.jsx
// マスク単位のレイヤー分割ツール v3
//
// 概要：
//   1枚の画像レイヤーに複数の離れたオブジェクト（宝石、アイコンなど）が
//   まとまっている場合、それぞれを個別のコンポジションに自動で振り分けるスクリプト。
//
// 使い方：
//   1. 対象の画像レイヤーを選択する
//   2. 「コンポの余白」を設定して [実行]
//   3. AEの「オートトレース」ダイアログが自動で開くので、チャンネル（アルファ推奨）
//      などを設定してOKを押す（キャンセルすると何も作成されない）
//   4. オートトレースで新しく作られたマスクごとに、その形状でクロップされた
//      新規コンポジションが作成される
//
// 判定方法：
//   オートトレース実行前後のマスク数を比較し、新しく追加されたマスクだけを対象にする
//   （元々あったマスクには影響しない）。各マスクのパス頂点からバウンディングボックスを
//   求め、レイヤーをコピーしたうえで対象のマスク以外はすべて削除する（無効化ではなく
//   削除）。これにより、矩形クロップではなくマスク形状どおりのクロップになり、
//   かつコピー先のレイヤーが余分なマスクを持ち歩かないため軽量になる。
//
// 制限事項：
//   ・判定は現在の再生ヘッド位置（comp.time）で行う
//   ・3Dレイヤーは X/Y と Z回転のみを考慮した簡易的な2D近似
//   ・親子関係が異なるグループにまたがる場合、自動位置調整はスキップされる
//     （警告として一覧表示されるので、該当レイヤーは手動で確認してください）
//   ・Position にエクスプレッションが設定されている場合も自動位置調整はスキップされる
//   ・マスクパスの頂点のみからバウンディングボックスを計算する（ベジェのハンドルが
//     頂点より大きく外側に膨らんでいる場合、その分は範囲に含まれないことがある）
//   ・「オートトレース」メニューコマンドの自動実行に失敗した場合は、手動で
//     レイヤー → オートトレース... を実行してから、もう一度このスクリプトを
//     実行してください（すでにあるマスクは対象にならないので、それを検出できます）
//
// ロジック本体は SplitByDistance.core.js に分離している（Node上でのテスト対象はそちら）。
// このファイルは、AEオブジェクトへの実際のアクセス（プロパティ値の取得、レイヤーの
// コピー・作成、オートトレースの呼び出し、UI）のみを担当する薄いアダプター。

#include "SplitByDistance.core.js"

(function () {

    // ============================================================
    // ユーティリティ（AEオブジェクトへの実アクセス）
    // ============================================================

    function getActiveComp() {
        var c = app.project.activeItem;
        return (c && c instanceof CompItem) ? c : null;
    }

    function isTargetLayer(layer) {
        if (!(layer instanceof AVLayer)) return false;
        if (layer.nullLayer) return false;
        if (layer.guideLayer) return false;
        if (layer.adjustmentLayer) return false;
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

    function offsetLayerPosition(layer, offX, offY) {
        try {
            SplitByDistanceCore.shiftVectorProp(layer.position, offX, offY);
        } catch (e) {
            try { SplitByDistanceCore.shiftScalarProp(layer.xPosition, offX); } catch (e1) {}
            try { SplitByDistanceCore.shiftScalarProp(layer.yPosition, offY); } catch (e2) {}
        }
    }

    // ============================================================
    // マスク関連のヘルパー
    // ============================================================

    function getMaskCount(layer) {
        try {
            var mg = layer.property("ADBE Mask Parade");
            return mg ? mg.numProperties : 0;
        } catch (e) { return 0; }
    }

    // fromIndex以降（1始まり）の、反転していないマスクを列挙し、
    // それぞれのバウンディングボックス（レイヤーローカル座標系）を返す。
    // ※ オートトレースが作るマスクは既定でモードが「なし」のまま作成される
    //   （画像全体をいきなり隠さないための仕様）。そのため、モードは問わず
    //   形状データとして扱う。
    // 戻り値: [{ maskIndex, rect }, ...]
    function getLayerMaskRects(layer, time, fromIndex) {
        var results = [];
        var maskGroup;
        try { maskGroup = layer.property("ADBE Mask Parade"); } catch (e) { return results; }
        if (!maskGroup) return results;

        for (var i = fromIndex; i <= maskGroup.numProperties; i++) {
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

    // newLayer上のマスクのうち、keepIndexに一致するもの以外をすべて削除し、
    // 残った1つを「加算」モードで有効化する（他の59個のマスクを持ち歩かせない
    // ことで、コピー先コンポの負荷を減らす）。
    // ※ インデックスの大きい方から削除することで、削除のたびに残りのマスクの
    //   番号がズレても keepIndex の対象を取り違えないようにしている。
    function keepOnlyMask(newLayer, keepIndex) {
        var maskGroup;
        try { maskGroup = newLayer.property("ADBE Mask Parade"); } catch (e) { return; }
        if (!maskGroup) return;

        for (var i = maskGroup.numProperties; i >= 1; i--) {
            if (i === keepIndex) continue;
            try { maskGroup.property(i).remove(); } catch (eD) {}
        }

        if (maskGroup.numProperties >= 1) {
            try { maskGroup.property(1).maskMode = MaskMode.ADD; } catch (eA) {}
        }
    }

    // 選択レイヤーに対してオートトレースを実行する（AE純正のダイアログが開く）。
    // コマンドが見つからない／実行できない場合は例外をthrowする。
    function runAutoTrace() {
        var cmdId = app.findMenuCommandId("Auto-trace...");
        if (!cmdId) {
            throw new Error(
                "「オートトレース」メニューコマンドが見つかりませんでした。\n" +
                "手動でメニュー → レイヤー → オートトレース... を実行してから、" +
                "もう一度このスクリプトを実行してください。"
            );
        }
        app.executeCommand(cmdId);
    }

    // ============================================================
    // UI
    // ============================================================

    var dlg = new Window("palette", "Split By Distance", undefined, { resizeable: false });
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "top"];
    dlg.spacing = 10;
    dlg.margins = [14, 14, 14, 14];

    var lblDesc = dlg.add("statictext", undefined,
        "選択した画像レイヤーをオートトレースし、離れたオブジェクトごとに\n別コンポジションへ分割します。",
        { multiline: true });

    var secSplit = dlg.add("panel", undefined, "  分割設定");
    secSplit.orientation = "column";
    secSplit.alignChildren = ["fill", "top"];
    secSplit.margins = [10, 14, 10, 10];
    secSplit.spacing = 3;

    var rowMargin = secSplit.add("group");
    rowMargin.alignment = "fill";
    rowMargin.add("statictext", undefined, "コンポの余白 (px)：");
    var txtMargin = rowMargin.add("edittext", undefined, "10");
    txtMargin.characters = 6;
    secSplit.add("statictext", undefined, "各コンポの周りに残す余白です。", { multiline: true });

    var rowPrefix = secSplit.add("group");
    rowPrefix.alignment = "fill";
    rowPrefix.add("statictext", undefined, "コンプ名の接頭辞：");
    var txtPrefix = rowPrefix.add("edittext", undefined, "");
    txtPrefix.characters = 16;
    txtPrefix.helpTip = "空欄の場合はアクティブコンプ名を使用します";

    var chkFolder = secSplit.add("checkbox", undefined, "生成したコンポをフォルダにまとめる");
    chkFolder.value = true;

    var chkDelete = secSplit.add("checkbox", undefined, "元レイヤーを削除する（移動モード）");
    chkDelete.value = false;
    chkDelete.helpTip = "OFF: 元コンポのレイヤーはそのまま残ります（複製）\nON: 新規コンポへコピー後、元レイヤーを削除します（移動）";

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

        var margin = parseFloat(txtMargin.text);
        if (isNaN(margin) || margin < 0) { alert("余白には0以上の数値を入力してください。"); return; }

        var sel = comp.selectedLayers;
        if (!sel || sel.length === 0) { alert("対象のレイヤーを選択してください。"); return; }

        var targetLayers = [];
        for (var s = 0; s < sel.length; s++) {
            if (isTargetLayer(sel[s])) targetLayers.push(sel[s]);
        }
        if (targetLayers.length === 0) { alert("対象になるレイヤーが見つかりませんでした。\n（Null / ガイド / 調整レイヤーは対象外です）"); return; }

        var time = comp.time;

        // オートトレース実行前のマスク数を記録
        var beforeCounts = [];
        for (var b = 0; b < targetLayers.length; b++) beforeCounts.push(getMaskCount(targetLayers[b]));

        try {
            runAutoTrace();
        } catch (eAT) {
            alert("オートトレースの実行でエラーが発生しました：\n\n" + eAT.message);
            return;
        }

        // 新しく追加されたマスクだけを対象にする
        var items = []; // {layer, box, maskIndex}
        var skipped = [];
        for (var t = 0; t < targetLayers.length; t++) {
            var lyr = targetLayers[t];
            var fromIndex = beforeCounts[t] + 1;
            var afterCount = getMaskCount(lyr);
            if (afterCount < fromIndex) {
                skipped.push(lyr.name + "（新しいマスクなし）");
                continue;
            }

            var maskRects = getLayerMaskRects(lyr, time, fromIndex);
            if (maskRects.length === 0) {
                skipped.push(lyr.name + "（新しいマスクなし）");
                continue;
            }

            var chain = buildTransformChain(lyr, time);
            for (var mr = 0; mr < maskRects.length; mr++) {
                var aabb = SplitByDistanceCore.aabbFromLocalRect(chain, maskRects[mr].rect);
                items.push({ layer: lyr, box: aabb, used3D: aabb.used3D, maskIndex: maskRects[mr].maskIndex });
            }
        }

        if (items.length === 0) {
            alert(
                "新しく作成されたマスクが見つかりませんでした。\n\n" +
                "オートトレースのダイアログでキャンセルした場合、または対象レイヤーに" +
                "変化がなかった場合はマスクが追加されません。"
            );
            return;
        }

        // ── 確認 ──
        var modeLabel = chkDelete.value ? "移動（元レイヤーは削除されます）" : "複製（元レイヤーは残ります）";
        var proceed = confirm(
            "【Split By Distance】\n" +
            "検出オブジェクト数: " + items.length + (skipped.length ? "（対象外 " + skipped.length + "件）" : "") + "\n" +
            "余白: " + margin + "px\n" +
            "モード: " + modeLabel + "\n\n" +
            "続行しますか？"
        );
        if (!proceed) return;

        var prefix = (txtPrefix.text && txtPrefix.text.replace(/^\s+|\s+$/g, "") !== "") ? txtPrefix.text.replace(/^\s+|\s+$/g, "") : comp.name;
        var digits = SplitByDistanceCore.digitsForCount(items.length);

        var warnings = [];
        var toDelete = [];
        var createdComps = 0;

        app.beginUndoGroup("Split By Distance");
        try {
            var targetFolder = null;
            if (chkFolder.value) {
                targetFolder = app.project.items.addFolder(prefix + " - Split");
            }

            for (var idx = 0; idx < items.length; idx++) {
                var item = items[idx];
                var srcLayer = item.layer;

                if (srcLayer.threeDLayer) {
                    warnings.push(srcLayer.name + "：3Dレイヤーのため簡易的な2D近似で計算しています。位置を確認してください。");
                }

                var layout = SplitByDistanceCore.computeCompLayout(item.box, margin, 30000);
                var compName = SplitByDistanceCore.buildCompName(prefix, idx + 1, digits);
                var newComp = app.project.items.addComp(compName, layout.width, layout.height, comp.pixelAspect, comp.duration, comp.frameRate);
                newComp.bgColor = comp.bgColor;
                if (targetFolder) newComp.parentFolder = targetFolder;

                srcLayer.copyToComp(newComp);
                var newLayer = newComp.layer(1);
                keepOnlyMask(newLayer, item.maskIndex);

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

                newComp.selected = true;
                createdComps++;
            }

            // 移動モード：元レイヤーを削除（全コピー完了後にまとめて実行、重複参照は除外）
            // ※ 同じレイヤーから複数のマスク=複数のオブジェクトが検出された場合、
            //   そのレイヤーは複数回コピーされているので、削除は1回だけ行う
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
            "作成したコンポ数: " + createdComps +
            (skipped.length ? "\n対象外: " + skipped.length + "件（" + skipped.join(", ") + "）" : "");

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
