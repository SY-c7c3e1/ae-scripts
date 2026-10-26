// C7_LiveComp.jsx
// LIVE用のコンポを作る。
//   1. フルHD（1920×1080）のコンポを作る（フレームレートと長さは画面で選ぶ）
//   2. 一番下にコンポサイズの黒い平面
//   3. その上に、Projectパネルで選択した画像を比率を変えずに、空白ができないよう
//      コンポいっぱいに敷き詰めたレイヤー（縦長なら横幅、横長なら高さを合わせる）
//   4. 一番上に「LIVE」のテキスト（MSゴシック・白・不透明度70%・中央）
//
// ・画像を複数選んでいれば、画像ごとにコンポを作る
// ・画像を選んでいなければ、黒平面とテキストだけのコンポを作る
// ・コンポ名は「LIVE_comp」。すでにあれば LIVE_comp_02, _03 … と連番になる
// ・フレームレートと長さは前回の値を覚えておく
//
// ロジック本体は LiveComp.core.js（Node上でテスト済み）。

#include "LiveComp.core.js"

(function () {
    var C = LiveCompCore;
    var SECTION = "C7_LiveComp";

    function getSetting(key, fallback) {
        try {
            if (app.settings.haveSetting(SECTION, key)) return app.settings.getSetting(SECTION, key);
        } catch (e) {}
        return fallback;
    }
    function setSetting(key, value) {
        try { app.settings.saveSetting(SECTION, key, String(value)); } catch (e) {}
    }

    if (!app.project) {
        alert("プロジェクトを開いてください。");
        return;
    }

    // Projectパネルで選択中の画像・動画素材（平面やコンポは除く）
    var images = [];
    var sel = app.project.selection;
    for (var i = 0; i < sel.length; i++) {
        var it = sel[i];
        if (it instanceof FootageItem && it.mainSource instanceof FileSource && it.hasVideo) images.push(it);
    }

    // ── 画面 ──
    var dlg = new Window("dialog", "LIVEコンポ作成");
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "top"];
    dlg.margins = 14;
    dlg.spacing = 8;

    var info = images.length === 0
        ? "画像：未選択（黒平面＋LIVEだけで作成します）"
        : (images.length === 1 ? "画像：" + images[0].name : "画像：" + images.length + "枚（1枚ずつコンポを作成します）");
    dlg.add("statictext", undefined, info, { truncate: "middle" }).characters = 36;
    dlg.add("statictext", undefined, "サイズ：1920 × 1080");

    var fpsRow = dlg.add("group");
    fpsRow.add("statictext", undefined, "フレームレート：");
    var labels = [];
    for (var f = 0; f < C.FRAME_RATES.length; f++) labels.push(C.FRAME_RATES[f].label);
    var fpsList = fpsRow.add("dropdownlist", undefined, labels);
    fpsList.selection = C.frameRateIndex(getSetting("fps", "30"));

    var durRow = dlg.add("group");
    durRow.add("statictext", undefined, "長さ（秒）：");
    var durText = durRow.add("edittext", undefined, getSetting("duration", "30"));
    durText.characters = 8;

    var btns = dlg.add("group");
    btns.alignment = ["right", "top"];
    btns.add("button", undefined, "キャンセル", { name: "cancel" });
    btns.add("button", undefined, "作成", { name: "ok" });

    if (dlg.show() !== 1) return;

    var fps = C.FRAME_RATES[fpsList.selection.index];
    var duration = C.parseDuration(durText.text);
    if (duration === null) {
        alert("長さ（秒）には 0 より大きい数字を入れてください。");
        return;
    }
    setSetting("fps", fps.label);
    setSetting("duration", duration);

    // ── 作成 ──
    function projectItemNames() {
        var names = [];
        for (var k = 1; k <= app.project.numItems; k++) names.push(app.project.item(k).name);
        return names;
    }

    function buildComp(image) {
        var comp = app.project.items.addComp(
            C.nextCompName(projectItemNames()),
            C.COMP_WIDTH, C.COMP_HEIGHT, 1, duration, fps.value
        );

        // 1. 黒平面（一番下）
        var bg = comp.layers.addSolid([0, 0, 0], "BG_Black", comp.width, comp.height, comp.pixelAspect, duration);
        bg.name = "BG_Black";

        // 2. 画像（比率を保ったまま、空白ができないように敷き詰める）
        if (image) {
            var imgLayer = comp.layers.add(image);
            var s = C.fillScalePercent(image.width, image.height, image.pixelAspect, comp.width, comp.height, comp.pixelAspect);
            imgLayer.property("ADBE Transform Group").property("ADBE Scale").setValue([s, s]);
            imgLayer.property("ADBE Transform Group").property("ADBE Position").setValue([comp.width / 2, comp.height / 2]);
            imgLayer.startTime = 0;
            imgLayer.inPoint = 0;
            imgLayer.outPoint = duration;
        }

        // 3. LIVE テキスト（一番上・中央）
        var txt = comp.layers.addText("LIVE");
        var srcText = txt.property("ADBE Text Properties").property("ADBE Text Document");
        var doc = srcText.value;
        doc.resetCharStyle();
        doc.resetParagraphStyle();
        doc.font = C.TEXT_FONT;
        doc.fontSize = C.textSize(comp.height);
        doc.applyFill = true;
        doc.fillColor = [1, 1, 1];
        doc.applyStroke = false;
        doc.justification = ParagraphJustification.CENTER_JUSTIFY;
        srcText.setValue(doc);

        // 文字の見た目の中心をコンポの中心に合わせる
        var r = txt.sourceRectAtTime(0, false);
        var tr = txt.property("ADBE Transform Group");
        tr.property("ADBE Anchor Point").setValue([r.left + r.width / 2, r.top + r.height / 2]);
        tr.property("ADBE Position").setValue([comp.width / 2, comp.height / 2]);
        tr.property("ADBE Opacity").setValue(C.TEXT_OPACITY);
        txt.outPoint = duration;

        return comp;
    }

    app.beginUndoGroup("LIVEコンポ作成");
    var last = null;
    try {
        if (images.length === 0) {
            last = buildComp(null);
        } else {
            for (var n = 0; n < images.length; n++) last = buildComp(images[n]);
        }
    } catch (e) {
        alert("作成中にエラーが発生しました：\n" + e.toString());
    }
    app.endUndoGroup();

    if (last) last.openInViewer();
})();
