// C7_MarkerNamer.jsx  v0.2
// マーカーの名前付け＋コピー＆ペーストをまとめたパネル
//
// ■ 名前付け
//   1. 音源レイヤーを選択
//   2. CTIをマーカー上（またはその直後）に置く
//   3. 名前ボタンを押す → 名前が付いて、CTIが次のマーカーへ移動
//   ※ 連番（01_ など）は自動で振り直し。OPTS.noNumber の名前は番号なし。
//
// ■ マーカーコピー（旧 MarkerCopy.jsx を統合）
//   1. コピー元のレイヤー（未選択ならコンポ）で [Copy]
//   2. ペースト先のレイヤー（未選択ならコンポ）で [Paste]
//
// ロジック本体は MarkerNamer.core.js / MarkerCopy.core.js に分離している
// （Node上でのテスト対象はそちら）。
// ScriptUI Panels に置く場合は .core.js の2ファイルも同じフォルダに置くこと。

#include "MarkerNamer.core.js"
#include "MarkerCopy.core.js"

(function (thisObj) {

    // ── 設定 ────────────────────────────────────────────────────
    var PRESETS  = [
        "intro", "1A", "1B", "1C",
        "2A", "2B", "2C", "D",
        "3C", "Theme", "Kanso", "outro",
        "atk"
    ];
    var OPTS     = {
        noNumber: ["atk"],   // 番号を付けない名前
        digits:   2          // 連番の桁数（2 → 01_）
    };
    var ROW_SIZE = 4;        // 1行に並べるボタン数

    var Core = MarkerNamerCore;

    // ── AEへのアクセス ──────────────────────────────────────────
    function getCtx(silent) {
        var comp = app.project.activeItem;
        if (!(comp && comp instanceof CompItem)) {
            if (!silent) alert("コンポジションを開いてください");
            return null;
        }
        if (comp.selectedLayers.length === 0) {
            if (!silent) alert("音源レイヤーを選択してください");
            return null;
        }
        var mk = comp.selectedLayers[0].property("ADBE Marker");
        if (mk.numKeys === 0) {
            if (!silent) alert("選択レイヤーにマーカーがありません");
            return null;
        }
        return { comp: comp, mk: mk };
    }

    function curIdx(ctx) {
        return Core.currentIndex(ctx.mk, ctx.comp.time, ctx.comp.frameDuration);
    }

    function moveTo(ctx, idx) {
        if (idx < 1 || idx > ctx.mk.numKeys) return;
        ctx.comp.time = ctx.mk.keyTime(idx);
    }

    // ── ボタンの動作 ────────────────────────────────────────────
    function applyName(name, goNext) {
        var ctx = getCtx(); if (!ctx) return;
        app.beginUndoGroup("Marker Namer: " + (name === "" ? "消去" : name));
        var idx = curIdx(ctx);
        Core.setName(ctx.mk, idx, name, OPTS);
        if (goNext) moveTo(ctx, idx + 1);
        app.endUndoGroup();
        updateStatus();
    }

    function step(dir) {
        var ctx = getCtx(); if (!ctx) return;
        moveTo(ctx, curIdx(ctx) + dir);
        updateStatus();
    }

    function renumberOnly() {
        var ctx = getCtx(); if (!ctx) return;
        app.beginUndoGroup("Marker Namer: 連番振り直し");
        Core.renumber(ctx.mk, OPTS);
        app.endUndoGroup();
        updateStatus();
    }

    // ── UI ──────────────────────────────────────────────────────
    var win = (thisObj instanceof Panel)
        ? thisObj
        : new Window("palette", "Marker Namer", undefined, { resizeable: true });
    win.orientation = "column";
    win.alignChildren = ["fill", "top"];
    win.spacing = 6;
    win.margins = 8;

    var status = win.add("statictext", undefined, "音源レイヤーを選んで開始", { truncate: "end" });

    // 名前ボタン
    var pGroup = win.add("panel", undefined, "名前");
    pGroup.alignChildren = ["fill", "top"];
    var row;
    for (var i = 0; i < PRESETS.length; i++) {
        if (i % ROW_SIZE === 0) {
            row = pGroup.add("group");
            row.alignChildren = ["fill", "center"];
            row.spacing = 4;
        }
        var b = row.add("button", undefined, PRESETS[i]);
        b.preferredSize = [48, 24];
        b.onClick = (function (n) { return function () { applyName(n, true); }; })(PRESETS[i]);
    }

    // 自由入力
    var fGroup = win.add("group");
    fGroup.alignChildren = ["fill", "center"];
    var freeTxt = fGroup.add("edittext", undefined, "");
    freeTxt.characters = 10;
    fGroup.add("button", undefined, "付ける").onClick = function () {
        var n = freeTxt.text.replace(/^\s+|\s+$/g, "");
        if (n !== "") applyName(n, true);
    };

    // 移動・操作
    var nav = win.add("group");
    nav.alignChildren = ["fill", "center"];
    nav.add("button", undefined, "◀ 前").onClick = function () { step(-1); };
    nav.add("button", undefined, "スキップ ▶").onClick = function () { step(1); };

    var tools = win.add("group");
    tools.alignChildren = ["fill", "center"];
    tools.add("button", undefined, "消去").onClick = function () { applyName("", false); };
    tools.add("button", undefined, "連番振り直し").onClick = renumberOnly;

    // ── マーカーコピー ──────────────────────────────────────────
    var clipboard = {
        markers:    [],   // [{time, obj}]
        sourceType: "",   // "layer" | "comp"
        sourceName: ""    // 表示用
    };

    var secCopy = win.add("panel", undefined, "マーカーコピー");
    secCopy.orientation = "column";
    secCopy.alignChildren = ["fill", "top"];
    secCopy.spacing = 4;

    var lblClip   = secCopy.add("statictext", undefined, "クリップボード：（空）", { truncate: "end" });
    var lblResult = secCopy.add("statictext", undefined, "", { truncate: "end" });

    var cpGroup = secCopy.add("group");
    cpGroup.alignChildren = ["fill", "center"];
    var btnCopy  = cpGroup.add("button", undefined, "Copy");
    var btnPaste = cpGroup.add("button", undefined, "Paste");

    var chkPosition    = secCopy.add("checkbox", undefined, "現在位置にペースト（先頭をCTIに合わせる）");
    var chkKeep        = secCopy.add("checkbox", undefined, "既存マーカーを保持（追記）");
    var chkLayerOffset = secCopy.add("checkbox", undefined, "レイヤーのイン点をオフセットに使う");

    function getActiveComp() {
        var c = app.project.activeItem;
        return (c && c instanceof CompItem) ? c : null;
    }

    function updateClip() {
        if (clipboard.markers.length === 0) {
            lblClip.text = "クリップボード：（空）";
        } else {
            lblClip.text = (clipboard.sourceType === "layer" ? "レイヤー：" : "コンポ：")
                         + clipboard.sourceName + "（" + clipboard.markers.length + "個）";
        }
    }

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
        lblResult.text = "";
        updateClip();
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

        app.beginUndoGroup("Marker Namer: Paste");
        try {
            if (layers.length > 0) {
                for (var i = 0; i < layers.length; i++) {
                    var lm  = layers[i].property("Marker");
                    var off = chkLayerOffset.value ? layers[i].startTime : 0;
                    total  += MarkerCopyCore.pasteToMarkerProp(lm, cti, off, clipboard.markers, pasteOptions);
                }
                lblResult.text = "✅ " + total + "個を " + layers.length + "レイヤーにペースト";
            } else {
                total = MarkerCopyCore.pasteToMarkerProp(comp.markerProperty, cti, 0, clipboard.markers, pasteOptions);
                lblResult.text = "✅ " + total + "個をコンポにペースト";
            }
        } catch (e) {
            alert("エラー：" + e.toString());
        } finally {
            app.endUndoGroup();
        }
        updateStatus();
    };

    function updateStatus() {
        var ctx = getCtx(true);
        if (!ctx) return;
        var idx = curIdx(ctx);
        var name = ctx.mk.keyValue(idx).comment;
        status.text = idx + " / " + ctx.mk.numKeys + " : " + (name === "" ? "（未命名）" : name);
    }

    win.onResizing = win.onResize = function () { this.layout.resize(); };
    if (win instanceof Window) { win.center(); win.show(); }
    else { win.layout.layout(true); }

})(this);
