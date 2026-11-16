// C7_BlRenderImport.jsx
// Blender でレンダリングした連番を、まとめて After Effects に読み込む。
//   1. 実行するとフォルダ選択のウィンドウが開く（前回のフォルダから始まる）
//   2. 選んだフォルダと、その下のフォルダ（6階層まで）から連番を探す
//   3. プロジェクトの「Bl-render」フォルダに、画像シーケンスとして読み込む
//
// ・「Bl-render」フォルダがなければ作り、あればそのまま使う
// ・すでに読み込んである連番は追加せず、再読み込みだけする（レンダリングし直したフレームが反映される）
// ・アルファは PNG / TIFF / TGA などはストレート、EXR はプリマルチプライドに設定
// ・レンダリング途中の一時ファイル（.c7part / .c7lock フォルダ）は読み込まない
// ・C7 Render Queue（Blender のレンダーキュー）の出力に合わせてある
//
// ロジック本体は BlRenderImport.core.js（Node上でテスト済み）。

#include "BlRenderImport.core.js"

(function () {
    var C = BlRenderImportCore;
    var SCRIPT_NAME = "C7 Bl-render Import";
    var BIN_NAME = "Bl-render";
    var SECTION = "C7_BlRenderImport";

    function getSetting(key, fallback) {
        try {
            if (app.settings.haveSetting(SECTION, key)) return app.settings.getSetting(SECTION, key);
        } catch (e) {}
        return fallback;
    }
    function setSetting(key, value) {
        try { app.settings.saveSetting(SECTION, key, String(value)); } catch (e) {}
    }

    function fileName(f) {
        try { return decodeURI(f.name); } catch (e) { return f.name; }
    }

    // Folder → [{name, isFolder, ref}]（core に渡す形）
    function listDir(folder) {
        var items = folder.getFiles();
        var out = [];
        for (var i = 0; i < items.length; i++) {
            out.push({ name: fileName(items[i]), isFolder: items[i] instanceof Folder, ref: items[i] });
        }
        return out;
    }

    function getBin(proj) {
        for (var i = 1; i <= proj.rootFolder.numItems; i++) {
            var it = proj.rootFolder.item(i);
            if (it instanceof FolderItem && it.name === BIN_NAME) return it;
        }
        return proj.items.addFolder(BIN_NAME);
    }

    // すでに読み込んである同じ連番（プロジェクトのどこにあっても）
    function findExisting(proj, seq) {
        var dir = C.normalizePath(seq.folder.fsName);
        for (var i = 1; i <= proj.numItems; i++) {
            var it = proj.item(i);
            if (!(it instanceof FootageItem)) continue;
            var src = it.mainSource;
            if (!(src instanceof FileSource) || !src.file) continue;
            var ex = { dir: C.normalizePath(src.file.parent.fsName), fileName: fileName(src.file), isStill: src.isStill };
            if (C.sameSequence(seq, dir, ex)) return it;
        }
        return null;
    }

    function setAlpha(item, ext) {
        try {
            var src = item.mainSource;
            if (src.hasAlpha) src.alphaMode = C.isPremultiplied(ext) ? AlphaMode.PREMULTIPLIED : AlphaMode.STRAIGHT;
        } catch (e) {}
    }

    function importSeq(proj, seq, bin) {
        var io = new ImportOptions(seq.first);
        if (seq.count > 1) {
            if (!io.canImportAs(ImportAsType.FOOTAGE)) throw new Error("読み込めない形式です");
            io.importAs = ImportAsType.FOOTAGE;
            io.sequence = true;
            io.forceAlphabetical = false;
        }
        var item = proj.importFile(io);
        item.parentFolder = bin;
        setAlpha(item, seq.ext);
        return item;
    }

    if (!app.project) app.newProject();
    var proj = app.project;

    var prompt = "連番が入っているフォルダを選んでください（下のフォルダも探します）";
    var last = getSetting("lastFolder", "");
    var start = last ? new Folder(last) : null;
    var root = (start && start.exists) ? start.selectDlg(prompt) : Folder.selectDialog(prompt);
    if (!root) return;
    setSetting("lastFolder", root.fsName);

    var seqs = C.findSequences(root, listDir);
    if (!seqs.length) {
        alert("連番が見つかりませんでした。\n" + root.fsName, SCRIPT_NAME);
        return;
    }

    var added = [], reloaded = [], failed = [], gaps = [];
    app.beginUndoGroup(SCRIPT_NAME);
    try {
        var bin = getBin(proj);
        for (var i = 0; i < seqs.length; i++) {
            var s = seqs[i];
            var lb = C.label(s);
            try {
                var ex = findExisting(proj, s);
                if (ex) {
                    ex.mainSource.reload();
                    reloaded.push(lb);
                } else {
                    importSeq(proj, s, bin);
                    added.push(lb);
                }
                if (s.gaps > 0) gaps.push(lb + "（" + s.gaps + "フレーム抜け）");
            } catch (e) {
                failed.push(lb + ": " + e.toString());
            }
        }
    } finally {
        app.endUndoGroup();
    }
    alert(C.summary(BIN_NAME, added, reloaded, failed, gaps), SCRIPT_NAME);
})();
