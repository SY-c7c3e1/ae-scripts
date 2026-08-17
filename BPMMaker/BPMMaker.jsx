// BPMMaker.jsx
// 指定BPMに合わせて、マーカーまたはヌルのキーフレームでビート位置の目印を配置する

(function (thisObj) {
    function showBPMMarkerUI(thisObj) {
        var win = (thisObj instanceof Panel) ? thisObj : new Window("palette", "BPM Marker Generator", undefined, {resizeable: true});

        win.orientation = "column";
        win.alignChildren = "left";
        win.spacing = 6;
        win.margins = 12;

        // ── BPM ──
        win.add("statictext", undefined, "BPM:");
        var bpmInput = win.add("edittext", undefined, "120");
        bpmInput.characters = 14;

        // ── 開始時間 ──
        win.add("statictext", undefined, "開始時間（秒）:");
        var startTimeInput = win.add("edittext", undefined, "0");
        startTimeInput.characters = 14;

        // ── 範囲指定モード ──
        win.add("statictext", undefined, "範囲指定:");
        var rangeModeDropdown = win.add("dropdownlist", undefined, [
            "コンポ全体に合わせる",
            "秒数で指定",
            "フレーム数で指定"
        ]);
        rangeModeDropdown.selection = 0;

        // 長さ入力
        var durationGroup = win.add("group");
        durationGroup.orientation = "row";
        durationGroup.add("statictext", undefined, "長さ:");
        var durationInput = durationGroup.add("edittext", undefined, "8");
        durationInput.characters = 10;
        var durationUnitLabel = durationGroup.add("statictext", undefined, "秒");
        durationGroup.enabled = false;

        rangeModeDropdown.onChange = function() {
            var idx = rangeModeDropdown.selection.index;
            durationGroup.enabled = (idx === 1 || idx === 2);
            durationUnitLabel.text = (idx === 2) ? "フレーム" : "秒";
        };

        // ── 印の種類（4択） ──
        win.add("statictext", undefined, "印の種類:");
        var typeDropdown = win.add("dropdownlist", undefined, [
            "選択レイヤーにマーカー",
            "ヌルの位置キーフレーム",
            "ヌルのOpacityキーフレーム（0→100→0）",
            "ヌルの位置 + Opacity（両方）"
        ]);
        typeDropdown.selection = 0;

        // ── 実行ボタン ──
        var runBtn = win.add("button", undefined, "▶ 配置実行");
        runBtn.preferredSize.width = 200;

        runBtn.onClick = function() {
            var comp = app.project.activeItem;
            if (!(comp && comp instanceof CompItem)) {
                alert("アクティブなコンポを開いてください");
                return;
            }

            var bpm       = parseFloat(bpmInput.text);
            var startTime = parseFloat(startTimeInput.text);
            var interval  = 60 / bpm;
            var mode      = typeDropdown.selection.index;
            var rangeMode = rangeModeDropdown.selection.index;
            var fps       = comp.frameRate;

            if (isNaN(bpm) || bpm <= 0) { alert("BPMが正しくありません"); return; }
            if (isNaN(startTime))        { alert("開始時間が正しくありません"); return; }

            // 終了時間を算出
            var endTime;
            if (rangeMode === 0) {
                endTime = comp.duration;
            } else if (rangeMode === 1) {
                endTime = startTime + parseFloat(durationInput.text);
            } else {
                endTime = startTime + parseInt(durationInput.text) / fps;
            }
            endTime = Math.min(endTime, comp.duration);

            app.beginUndoGroup("BPM印配置");

            // ── 0: 選択レイヤーにマーカー ────────────────
            if (mode === 0) {
                var selectedLayers = comp.selectedLayers;
                if (!selectedLayers || selectedLayers.length === 0) {
                    alert("レイヤーを選択してください");
                    app.endUndoGroup();
                    return;
                }
                for (var li = 0; li < selectedLayers.length; li++) {
                    var layer = selectedLayers[li];
                    var markerProp = layer.marker;
                    for (var i = 0; ; i++) {
                        var t = startTime + i * interval;
                        if (t >= endTime) break;
                        if (t < layer.inPoint || t > layer.outPoint) continue;
                        markerProp.setValueAtTime(t, new MarkerValue(""));
                    }
                }

            // ── 1: ヌルの位置キーフレーム ───────────────
            } else if (mode === 1) {
                var nullLayer = comp.layers.addNull();
                nullLayer.name = "BPM_Position_Null";
                nullLayer.label = 10;
                nullLayer.inPoint  = 0;
                nullLayer.outPoint = comp.duration;

                var cx = comp.width  / 2;
                var cy = comp.height / 2;
                var posProp = nullLayer.transform.position;

                for (var i = 0; ; i++) {
                    var t = startTime + i * interval;
                    if (t >= endTime) break;
                    var yOffset = (i % 2 === 0) ? -50 : 50;
                    posProp.setValueAtTime(t, [cx, cy + yOffset]);
                }

                try {
                    for (var k = 1; k <= posProp.numKeys; k++) {
                        posProp.setInterpolationTypeAtKey(k, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
                    }
                } catch(e) {}

            // ── 2: ヌルのOpacityキーフレーム ────────────
            } else if (mode === 2) {
                var nullLayer = comp.layers.addNull();
                nullLayer.name = "BPM_Opacity_Null";
                nullLayer.label = 6;
                nullLayer.inPoint  = 0;
                nullLayer.outPoint = comp.duration;

                var opacityProp = nullLayer.transform.opacity;

                for (var i = 0; ; i++) {
                    var t = startTime + i * interval;
                    if (t >= endTime) break;

                    var nextBeat = startTime + (i + 1) * interval;
                    if (nextBeat > endTime) nextBeat = endTime;

                    opacityProp.setValueAtTime(t,          0);
                    opacityProp.setValueAtTime(t + 0.01, 100);
                    var fadeOut = nextBeat - (1 / fps);
                    if (fadeOut > t + 0.01) {
                        opacityProp.setValueAtTime(fadeOut, 0);
                    }
                }

                try {
                    for (var k = 1; k <= opacityProp.numKeys; k++) {
                        opacityProp.setInterpolationTypeAtKey(k, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
                    }
                } catch(e) {}

            // ── 3: 位置 + Opacity 両方 ─────────────────
            } else if (mode === 3) {
                var nullLayer = comp.layers.addNull();
                nullLayer.name = "BPM_Guide_Null";
                nullLayer.label = 10;
                nullLayer.inPoint  = 0;
                nullLayer.outPoint = comp.duration;

                var cx = comp.width  / 2;
                var cy = comp.height / 2;
                var posProp     = nullLayer.transform.position;
                var opacityProp = nullLayer.transform.opacity;

                for (var i = 0; ; i++) {
                    var t = startTime + i * interval;
                    if (t >= endTime) break;

                    var nextBeat = startTime + (i + 1) * interval;
                    if (nextBeat > endTime) nextBeat = endTime;

                    var yOffset = (i % 2 === 0) ? -50 : 50;
                    posProp.setValueAtTime(t, [cx, cy + yOffset]);

                    opacityProp.setValueAtTime(t,          0);
                    opacityProp.setValueAtTime(t + 0.01, 100);
                    var fadeOut = nextBeat - (1 / fps);
                    if (fadeOut > t + 0.01) {
                        opacityProp.setValueAtTime(fadeOut, 0);
                    }
                }

                try {
                    for (var k = 1; k <= posProp.numKeys; k++) {
                        posProp.setInterpolationTypeAtKey(k, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
                    }
                    for (var k = 1; k <= opacityProp.numKeys; k++) {
                        opacityProp.setInterpolationTypeAtKey(k, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
                    }
                } catch(e) {}
            }

            app.endUndoGroup();
            alert("完了しました！");
        };

        win.center();
        win.show();
    }

    showBPMMarkerUI(thisObj);
})(this);
