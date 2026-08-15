// MarkerCopy.jsx
// マーカークリップボードツール v3
//
// 使い方：
//   1. コピーしたいレイヤー or コンポを選択して [Copy]
//   2. ペースト先のレイヤー or コンポを選択して [Paste]
//      ├ レイヤー選択中 → そのレイヤーのマーカーへ
//      └ 未選択        → アクティブコンポのマーカーへ
//
// 「現在位置にペースト」ON時：
//   コピーしたマーカー群の先頭がタイムラインの現在位置に来るようにシフト
//
// ロジック本体は MarkerCopy.core.js に分離している（Node上でのテスト対象はそちら）。

#include "MarkerCopy.core.js"

(function () {

    // ── 内部クリップボード ────────────────────────────────────────
    var clipboard = {
        markers:     [],   // [{time, obj}]
        sourceType:  "",   // "layer" | "comp"
        sourceName:  ""    // 表示用
    };

    // ── ヘルパー ──────────────────────────────────────────────────

    function getActiveComp() {
        var c = app.project.activeItem;
        return (c && c instanceof CompItem) ? c : null;
    }

    // ── UI ──────────────────────────────────────────────────────

    var dlg = new Window("palette", "Marker Copy", undefined, { resizeable: false });
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "top"];
    dlg.spacing = 10;
    dlg.margins = [14, 14, 14, 14];

    // ── クリップボード状態表示 ────────────────────────────────────
    var secStatus = dlg.add("panel", undefined, "  クリップボード");
    secStatus.orientation = "column";
    secStatus.alignChildren = ["fill", "top"];
    secStatus.margins = [10, 14, 10, 10];
    secStatus.spacing = 3;

    var lblStatus = secStatus.add("statictext", undefined, "（空）");
    var lblCount  = secStatus.add("statictext", undefined, "");

    function updateStatus() {
        if (clipboard.markers.length === 0) {
            lblStatus.text = "（空）";
            lblCount.text  = "";
        } else {
            lblStatus.text = (clipboard.sourceType === "layer" ? "レイヤー：" : "コンポ：")
                             + clipboard.sourceName;
            lblCount.text  = clipboard.markers.length + " 個のマーカーを保持中";
        }
    }

    // ── Copy / Paste ──────────────────────────────────────────────
    var cpGroup = dlg.add("group");
    cpGroup.alignment = "fill";
    cpGroup.spacing = 8;

    var btnCopy  = cpGroup.add("button", undefined, "Copy");
    var btnPaste = cpGroup.add("button", undefined, "Paste");
    btnCopy.preferredSize.width  = 106;
    btnPaste.preferredSize.width = 106;

    // ── オプション ────────────────────────────────────────────────
    var secOpt = dlg.add("panel", undefined, "  オプション");
    secOpt.orientation = "column";
    secOpt.alignChildren = ["fill", "top"];
    secOpt.margins = [10, 14, 10, 10];
    secOpt.spacing = 5;

    var chkPosition    = secOpt.add("checkbox", undefined, "現在位置にペースト（先頭マーカーをCTIに合わせる）");
    var chkKeep        = secOpt.add("checkbox", undefined, "既存マーカーを保持（追記）");
    var chkLayerOffset = secOpt.add("checkbox", undefined, "レイヤーのイン点をオフセットに使う");
    chkPosition.value    = false;
    chkKeep.value        = false;
    chkLayerOffset.value = false;

    // ── 閉じるボタン ─────────────────────────────────────────────
    var btnClose = dlg.add("button", undefined, "閉じる");
    btnClose.alignment = "right";

    // ── ロジック ─────────────────────────────────────────────────

    btnCopy.onClick = function () {
        var comp = getActiveComp();
        if (!comp) { alert("アクティブなコンポジションを開いてください。"); return; }

        var layers  = comp.selectedLayers;
        var markers = [];
        var names   = [];

        if (layers.length > 0) {
            // レイヤーマーカーをコピー
            for (var i = 0; i < layers.length; i++) {
                var lm  = layers[i].property("Marker");
                var off = chkLayerOffset.value ? layers[i].startTime : 0;
                var ml  = MarkerCopyCore.collectFromProp(lm);
                for (var k = 0; k < ml.length; k++) ml[k].time += off;
                markers = markers.concat(ml);
                names.push(layers[i].name);
            }
            clipboard.sourceType = "layer";
            clipboard.sourceName = names.join(", ");
        } else {
            // コンポマーカーをコピー
            markers = MarkerCopyCore.collectFromProp(comp.markerProperty);
            clipboard.sourceType = "comp";
            clipboard.sourceName = comp.name;
        }

        if (markers.length === 0) {
            alert("マーカーが見つかりませんでした。");
            return;
        }

        clipboard.markers = markers;
        updateStatus();
    };

    btnPaste.onClick = function () {
        if (clipboard.markers.length === 0) {
            alert("クリップボードが空です。先に Copy してください。");
            return;
        }

        var comp = getActiveComp();
        if (!comp) { alert("アクティブなコンポジションを開いてください。"); return; }

        var layers = comp.selectedLayers;
        var cti    = comp.time;
        var total  = 0;
        var pasteOptions = { usePosition: chkPosition.value, keepExisting: chkKeep.value };

        app.beginUndoGroup("MarkerCopier Paste");
        try {
            if (layers.length > 0) {
                for (var i = 0; i < layers.length; i++) {
                    var lm  = layers[i].property("Marker");
                    var off = chkLayerOffset.value ? layers[i].startTime : 0;
                    total  += MarkerCopyCore.pasteToMarkerProp(lm, cti, off, clipboard.markers, pasteOptions);
                }
                alert("✅ " + total + " 個のマーカーを " + layers.length + " レイヤーにペーストしました。");
            } else {
                total = MarkerCopyCore.pasteToMarkerProp(comp.markerProperty, cti, 0, clipboard.markers, pasteOptions);
                alert("✅ " + total + " 個のマーカーをコンポジションにペーストしました。");
            }
        } catch (e) {
            alert("エラー：" + e.toString());
        } finally {
            app.endUndoGroup();
        }
    };

    btnClose.onClick = function () { dlg.close(); };

    updateStatus();
    dlg.center();
    dlg.show();

})();
