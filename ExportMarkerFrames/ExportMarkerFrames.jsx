// ExportMarkerFrames.jsx
// アクティブなコンポのマーカーを CSV に書き出す（Blender / UE5 のシーケンス用の資料）。
//
// 画面で選ぶもの：
//   対象   … 選択レイヤーのマーカー / コンポマーカー / 両方
//   種類   … コメント付きのみ / すべて
// 列：Name, Frame, EndFrame, DurationFrames, Seconds, Timecode, FPS, Source, Comment
//   ・Frame は AE のタイムラインに表示されている番号のまま
//   ・1列目 Name（M001…）は UE5 の Data Table に読み込むときの行名になる
//   ・文字コードは UTF-8（BOM付き）。Excel でも文字化けしない。
//     Blender の Python では open(path, encoding="utf-8-sig") で読む
// 選んだ設定は次回も使われる。
//
// 旧ファイル名: AE_ExportMarkerFrames.jsx（Script_for_AEpanel/06Export_data から移動）
// ロジック本体は ExportMarkerFrames.core.js（Node上でテスト済み）。

#include "ExportMarkerFrames.core.js"

(function () {
    var C = ExportMarkerFramesCore;
    var SECTION = "C7_ExportMarkerFrames";

    function getSetting(key, fallback) {
        try {
            if (app.settings.haveSetting(SECTION, key)) return app.settings.getSetting(SECTION, key);
        } catch (e) {}
        return fallback;
    }
    function setSetting(key, value) {
        try { app.settings.saveSetting(SECTION, key, String(value)); } catch (e) {}
    }

    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
        alert("コンポジションを開いてから実行してください。");
        return;
    }
    var selectedLayers = comp.selectedLayers;

    // ── 画面 ──
    var dlg = new Window("dialog", "マーカーをCSV書き出し");
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "top"];
    dlg.margins = 14;
    dlg.spacing = 8;

    dlg.add("statictext", undefined, "コンポ：" + comp.name, { truncate: "middle" }).characters = 34;

    var pTarget = dlg.add("panel", undefined, "  対象");
    pTarget.alignChildren = ["left", "top"];
    pTarget.margins = [10, 14, 10, 8];
    var rbLayer = pTarget.add("radiobutton", undefined, "選択レイヤーのマーカー（" + selectedLayers.length + "個選択中）");
    var rbComp = pTarget.add("radiobutton", undefined, "コンポマーカー");
    var rbBoth = pTarget.add("radiobutton", undefined, "両方");
    var target = getSetting("target", "layer");
    if (target === "comp") rbComp.value = true;
    else if (target === "both") rbBoth.value = true;
    else rbLayer.value = true;

    var pKind = dlg.add("panel", undefined, "  種類");
    pKind.alignChildren = ["left", "top"];
    pKind.margins = [10, 14, 10, 8];
    var rbCommentOnly = pKind.add("radiobutton", undefined, "コメント付きのみ");
    var rbAll = pKind.add("radiobutton", undefined, "すべて（コメントなしも含む）");
    if (getSetting("kind", "comment") === "all") rbAll.value = true;
    else rbCommentOnly.value = true;

    var btns = dlg.add("group");
    btns.alignment = ["right", "top"];
    btns.add("button", undefined, "キャンセル", { name: "cancel" });
    btns.add("button", undefined, "書き出し", { name: "ok" });

    if (dlg.show() !== 1) return;

    target = rbComp.value ? "comp" : (rbBoth.value ? "both" : "layer");
    var commentOnly = rbCommentOnly.value;
    setSetting("target", target);
    setSetting("kind", commentOnly ? "comment" : "all");

    // ── マーカーを集める ──
    function collect(markerProp, sourceName, out) {
        if (!markerProp) return;
        for (var k = 1; k <= markerProp.numKeys; k++) {
            var mv = markerProp.keyValue(k);
            out.push({
                time: markerProp.keyTime(k),
                duration: mv.duration,
                comment: mv.comment,
                source: sourceName
            });
        }
    }

    var markers = [];
    if (target === "comp" || target === "both") {
        collect(comp.markerProperty, "Comp", markers);
    }
    if (target === "layer" || target === "both") {
        if (selectedLayers.length === 0 && target === "layer") {
            alert("レイヤーを選択してください。\n（コンポマーカーを書き出すなら「コンポマーカー」を選んでください）");
            return;
        }
        for (var i = 0; i < selectedLayers.length; i++) {
            collect(selectedLayers[i].property("ADBE Marker"), selectedLayers[i].name, markers);
        }
    }

    // AE のタイムラインに表示されている番号に合わせる（開始フレームが 0 以外のコンポ用）
    var startFrame = 0;
    try {
        startFrame = (typeof comp.displayStartFrame === "number")
            ? comp.displayStartFrame
            : Math.round(comp.displayStartTime * comp.frameRate);
    } catch (e0) {}

    var rows = C.buildRows(markers, { fps: comp.frameRate, startFrame: startFrame, commentOnly: commentOnly });
    if (rows.length === 0) {
        alert(commentOnly ? "コメント付きのマーカーが見つかりませんでした。" : "マーカーが見つかりませんでした。");
        return;
    }

    // ── 保存 ──
    var lastDir = getSetting("lastDir", "");
    var folder = (lastDir && new Folder(lastDir).exists) ? lastDir : Folder.desktop.fsName;
    var saveFile = new File(folder + "/" + C.defaultFileName(comp.name)).saveDlg("CSVの保存先を選択", "CSV:*.csv");
    if (!saveFile) return;
    if (!/\.csv$/i.test(saveFile.name)) saveFile = new File(saveFile.fsName + ".csv");

    saveFile.encoding = "UTF-8";
    saveFile.lineFeed = "Unix"; // 改行は toCsv 側で CRLF にしている
    if (!saveFile.open("w")) {
        alert("ファイルを開けませんでした：\n" + saveFile.fsName);
        return;
    }
    saveFile.write("﻿" + C.toCsv(rows));
    saveFile.close();
    setSetting("lastDir", saveFile.parent.fsName);

    alert("書き出し完了！\n" + rows.length + "個のマーカーを書き出しました。\n" + saveFile.fsName);
})();
