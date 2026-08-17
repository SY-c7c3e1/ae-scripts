// C7_CompSettingsChanger.jsx
// 選択中のコンポジション（1個以上）の設定をまとめて変更するツール
//
// 元は Selected_Comps_Changer.jsx (v2.6, by CR Green) という配布スクリプトだが、
// よく使われていた「Width/Height/Framerate/Duration/extend/re-center」だけに絞り、
// 以下を追加した簡易版：
//   ・Framerateはドロップダウン選択式（29.97/59.94はNon-Drop/Dropを選べる）
//   ・アスペクト比を指定して、Width/Heightの片方だけ入力すればもう片方を自動計算できる
//   ・「Length」を「Duration」に改名（表記のみ、単位は元と同じくフレーム数）
//
// ロジック本体は CompSettingsChanger.core.js に分離している（Node上でのテスト対象はそちら）。

#include "CompSettingsChanger.core.js"

(function () {

    function getSelectedComps() {
        var comps = [];
        var items = app.project.items;
        for (var i = 1; i <= items.length; i++) {
            var item = items[i];
            if (item instanceof CompItem && item.selected) {
                comps.push(item);
            }
        }
        return comps;
    }

    if (!app.project || getSelectedComps().length === 0) {
        alert("コンポジションを1つ以上選択してください。");
        return;
    }

    // ── UI ──────────────────────────────────────────────────

    var dlg = new Window("dialog", "コンポ設定変更", undefined, { resizeable: false });
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "top"];
    dlg.spacing = 10;
    dlg.margins = [14, 14, 14, 14];

    dlg.add("statictext", undefined, "（空欄の項目は変更しません）");

    // ── サイズ ────────────────────────────────────────────────
    var secSize = dlg.add("panel", undefined, "  サイズ");
    secSize.orientation = "column";
    secSize.alignChildren = ["fill", "top"];
    secSize.margins = [10, 14, 10, 10];
    secSize.spacing = 6;

    var whGroup = secSize.add("group");
    whGroup.add("statictext", undefined, "Width:");
    var widthEditText = whGroup.add("edittext", undefined, "");
    widthEditText.characters = 8;
    whGroup.add("statictext", undefined, "Height:");
    var heightEditText = whGroup.add("edittext", undefined, "");
    heightEditText.characters = 8;

    var ratioGroup = secSize.add("group");
    ratioGroup.add("statictext", undefined, "アスペクト比:");
    var ratioEditText = ratioGroup.add("edittext", undefined, "");
    ratioEditText.characters = 10;
    var ratioHelpBtn = ratioGroup.add("button", undefined, "?");
    ratioHelpBtn.preferredSize.width = 24;
    ratioHelpBtn.onClick = function () {
        alert(
            "アスペクト比の指定について\r\r" +
            "「16:9」「16/9」「1.778」のように入力できます。\r\r" +
            "・Width と Height を両方入力した場合 → アスペクト比は無視してそのまま使う\r" +
            "・Width だけ入力した場合 → アスペクト比から Height を自動計算\r" +
            "・Height だけ入力した場合 → アスペクト比から Width を自動計算\r" +
            "・アスペクト比だけ入力した場合 → 現在の Width はそのまま、Height だけそのアスペクト比に合わせて計算"
        );
    };

    var recenterGroup = secSize.add("group");
    var recenterCheck = recenterGroup.add("checkbox", undefined, "re-center layers（サイズ変更時にレイヤーを中央基準でずらす）");
    recenterCheck.value = true;
    var recenterHelpBtn = recenterGroup.add("button", undefined, "?");
    recenterHelpBtn.preferredSize.width = 24;
    recenterHelpBtn.onClick = function () {
        alert(
            "re-center layersについて\r\r" +
            "サイズ変更後、レイヤーが中央基準になるように全レイヤーの位置をずらします。\r" +
            "2Dレイヤー向けの機能で、複雑な3D構成では意図しない結果になることがあります。\r\r" +
            "※ この処理を行うと、ロックされているレイヤーは一旦すべてアンロックされます。"
        );
    };

    // ── フレームレート・Duration ──────────────────────────────
    var secTime = dlg.add("panel", undefined, "  フレームレート / Duration");
    secTime.orientation = "column";
    secTime.alignChildren = ["fill", "top"];
    secTime.margins = [10, 14, 10, 10];
    secTime.spacing = 6;

    var frGroup = secTime.add("group");
    frGroup.add("statictext", undefined, "Framerate:");
    var frDropdown = frGroup.add("dropdownlist", undefined, []);
    for (var i = 0; i < CompSettingsChangerCore.FRAME_RATE_PRESETS.length; i++) {
        frDropdown.add("item", CompSettingsChangerCore.FRAME_RATE_PRESETS[i].label);
    }
    frDropdown.selection = 0; // "変更しない"

    var frCustomEditText = frGroup.add("edittext", undefined, "");
    frCustomEditText.characters = 8;
    frCustomEditText.enabled = false;

    frDropdown.onChange = function () {
        var preset = CompSettingsChangerCore.FRAME_RATE_PRESETS[frDropdown.selection.index];
        frCustomEditText.enabled = (preset.key === "custom");
    };

    var durGroup = secTime.add("group");
    durGroup.add("statictext", undefined, "Duration（フレーム数）:");
    var durationEditText = durGroup.add("edittext", undefined, "");
    durationEditText.characters = 8;

    var extendCheck = secTime.add("checkbox", undefined, "延長時、comp終端まであるレイヤーのアウト点を新しい長さに合わせる");
    extendCheck.value = true;

    // ── ボタン ──────────────────────────────────────────────
    var btnGroup = dlg.add("group");
    btnGroup.alignment = "right";
    var cancelBtn = btnGroup.add("button", undefined, "Cancel", { name: "cancel" });
    var okBtn = btnGroup.add("button", undefined, "OK", { name: "ok" });

    cancelBtn.onClick = function () { dlg.close(0); };

    okBtn.onClick = function () {
        var problems = [];

        var frPreset = CompSettingsChangerCore.FRAME_RATE_PRESETS[frDropdown.selection.index];
        var frResult = CompSettingsChangerCore.resolveFrameRateSelection(frPreset.key, frCustomEditText.text);
        if (frResult.error) {
            problems.push("Framerate: " + frResult.error);
        }

        var comps = getSelectedComps();

        app.beginUndoGroup("コンポ設定変更");

        for (var c = 0; c < comps.length; c++) {
            var comp = comps[c];

            // ── サイズ ──
            var dimResult = CompSettingsChangerCore.computeDimensions(
                { width: comp.width, height: comp.height },
                { widthText: widthEditText.text, heightText: heightEditText.text, ratioText: ratioEditText.text }
            );
            if (dimResult.error) {
                problems.push(comp.name + " - " + dimResult.error);
            } else if (dimResult.width !== comp.width || dimResult.height !== comp.height) {
                var oldWidth = comp.width;
                var oldHeight = comp.height;
                comp.width = dimResult.width;
                comp.height = dimResult.height;

                if (recenterCheck.value) {
                    var offsetX = CompSettingsChangerCore.computeRecenterOffset(oldWidth, dimResult.width);
                    var offsetY = CompSettingsChangerCore.computeRecenterOffset(oldHeight, dimResult.height);
                    if (offsetX !== 0 || offsetY !== 0) {
                        recenterLayers(comp, offsetX, offsetY);
                    }
                }
            }

            // ── フレームレート ──
            var effectiveFrameRate = comp.frameRate;
            if (!frResult.error && frResult.frameRate !== null) {
                comp.frameRate = frResult.frameRate;
                if (frResult.dropFrame !== null) {
                    comp.dropFrame = frResult.dropFrame;
                }
                effectiveFrameRate = frResult.frameRate;
            }

            // ── Duration ──
            var durResult = CompSettingsChangerCore.computeDurationSeconds(durationEditText.text, effectiveFrameRate);
            if (durResult.error) {
                problems.push(comp.name + " - Duration: " + durResult.error);
            } else if (durResult.durationSeconds !== null) {
                var oldDuration = comp.duration;
                if (extendCheck.value && CompSettingsChangerCore.shouldExtendLayers(durResult.durationSeconds, oldDuration)) {
                    var layers = [];
                    for (var li = 1; li <= comp.numLayers; li++) layers.push(comp.layer(li));
                    CompSettingsChangerCore.extendLayersToNewEnd(layers, oldDuration, durResult.durationSeconds);
                }
                comp.duration = durResult.durationSeconds;
            }
        }

        app.endUndoGroup();

        if (problems.length > 0) {
            alert("以下の項目は適用されませんでした：\r" + problems.join("\r"));
        }

        dlg.close(1);
    };

    // サイズ変更時にレイヤーを中央基準でずらす（nullレイヤーを親にして移動する元スクリプトの手法を踏襲）。
    // ロックされているレイヤーもすべて一時的にアンロックされる。
    function recenterLayers(comp, offsetX, offsetY) {
        for (var i = 1; i <= comp.numLayers; i++) {
            var layer = comp.layer(i);
            if (layer.locked) layer.locked = false;
        }

        var nullLayer = comp.layers.addNull();
        nullLayer.threeDLayer = true;
        var nullSource = nullLayer.source;
        nullLayer.position.setValue([0, 0, 0]);

        for (var j = 1; j <= comp.numLayers; j++) {
            var curLayer = comp.layer(j);
            if (curLayer !== nullLayer && curLayer.parent === null) {
                curLayer.parent = nullLayer;
            }
        }

        nullLayer.position.setValue([offsetX, offsetY, 0]);
        nullLayer.remove();
        nullSource.remove();
    }

    dlg.center();
    dlg.show();

})();
