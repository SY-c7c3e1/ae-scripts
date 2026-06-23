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

    function markerValueToObj(mv) {
        return {
            comment:      mv.comment,
            duration:     mv.duration,
            chapter:      mv.chapter,
            url:          mv.url,
            frameTarget:  mv.frameTarget,
            cuePointName: mv.cuePointName,
            label:        mv.label
        };
    }

    function buildMarkerValue(obj) {
        var mv = new MarkerValue(obj.comment);
        mv.duration     = obj.duration;
        mv.chapter      = obj.chapter;
        mv.url          = obj.url;
        mv.frameTarget  = obj.frameTarget;
        mv.cuePointName = obj.cuePointName;
        mv.label        = obj.label;
        return mv;
    }

    function collectFromProp(prop) {
        var list = [];
        for (var k = 1; k <= prop.numKeys; k++) {
            list.push({ time: prop.keyTime(k), obj: markerValueToObj(prop.keyValue(k)) });
        }
        return list;
    }

    // マーカー群の最小時刻を返す
    function firstTime(markers) {
        if (markers.length === 0) return 0;
        var t = markers[0].time;
        for (var i = 1; i < markers.length; i++) {
            if (markers[i].time < t) t = markers[i].time;
        }
        return t;
    }

    function pasteToMarkerProp(destProp, destCti, layerOffset) {
        var srcMarkers  = clipboard.markers;
        var usePosition = chkPosition.value;
        var keepExist   = chkKeep.value;

        // 「現在位置にペースト」：先頭マーカーをCTIに合わせてシフト
        var shift = usePosition ? (destCti - firstTime(srcMarkers)) : 0;

        var toWrite = [];
        for (var i = 0; i < srcMarkers.length; i++) {
            var t = srcMarkers[i].time + shift - layerOffset;
            toWrite.push({ time: t, obj: srcMarkers[i].obj });
        }

        if (!keepExist) {
            while (destProp.numKeys > 0) destProp.removeKey(1);
        }

        for (var i = 0; i < toWrite.length; i++) {
            destProp.setValueAtTime(toWrite[i].time, buildMarkerValue(toWrite[i].obj));
        }
        return toWrite.length;
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
                var ml  = collectFromProp(lm);
                for (var k = 0; k < ml.length; k++) ml[k].time += off;
                markers = markers.concat(ml);
                names.push(layers[i].name);
            }
            clipboard.sourceType = "layer";
            clipboard.sourceName = names.join(", ");
        } else {
            // コンポマーカーをコピー
            markers = collectFromProp(comp.markerProperty);
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

        app.beginUndoGroup("MarkerCopier Paste");
        try {
            if (layers.length > 0) {
                for (var i = 0; i < layers.length; i++) {
                    var lm  = layers[i].property("Marker");
                    var off = chkLayerOffset.value ? layers[i].startTime : 0;
                    total  += pasteToMarkerProp(lm, cti, off);
                }
                alert("✅ " + total + " 個のマーカーを " + layers.length + " レイヤーにペーストしました。");
            } else {
                total = pasteToMarkerProp(comp.markerProperty, cti, 0);
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
