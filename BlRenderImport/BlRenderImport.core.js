// BlRenderImport.core.js
// C7_BlRenderImport.jsx のロジック本体（UI・AE非依存）。Nodeでテストできる。
// フォルダの中身を受け取って「連番」をまとめる。

(function (global) {

    // 読み込む画像の拡張子
    var EXTS = { png: 1, jpg: 1, jpeg: 1, exr: 1, tif: 1, tiff: 1, tga: 1, dpx: 1, bmp: 1, psd: 1 };
    // アルファをプリマルチプライドとして扱う拡張子（それ以外はストレート）
    var PREMULT_EXTS = { exr: 1 };
    var MAX_DEPTH = 6;

    // "NUZ_01_SEM_0001.png" → { prefix:"NUZ_01_SEM_", num:1, digits:4, ext:"png" }
    function parseName(name) {
        var m = /^(.*?)(\d+)\.([A-Za-z0-9]+)$/.exec(name);
        if (!m) return null;
        var ext = m[3].toLowerCase();
        if (!EXTS[ext]) return null;
        return { prefix: m[1], num: parseInt(m[2], 10), digits: m[2].length, ext: ext };
    }

    // 探さないフォルダ（.c7lock など . で始まるもの）
    function skipFolder(name) {
        return name.charAt(0) === "." || name === "__MACOSX";
    }

    // 読み込まないファイル（レンダリング途中の一時ファイル）
    function skipFile(name) {
        return /\.c7part$/i.test(name) || name.charAt(0) === ".";
    }

    function byName(a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; }

    // 1つのフォルダの中身 [{name, isFolder, ref}] → その中の連番
    // 戻り値: [{prefix, ext, digits, first(ref), firstName, count, min, max, gaps}]
    function groupSequences(entries) {
        var groups = {}, order = [];
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            if (e.isFolder || skipFile(e.name)) continue;
            var p = parseName(e.name);
            if (!p) continue;
            var key = p.prefix + "\u0000" + p.digits + "\u0000" + p.ext;
            if (!groups[key]) { groups[key] = { prefix: p.prefix, ext: p.ext, digits: p.digits, files: [] }; order.push(key); }
            groups[key].files.push({ ref: e.ref, name: e.name, num: p.num });
        }
        var out = [];
        for (var k = 0; k < order.length; k++) {
            var g = groups[order[k]];
            g.files.sort(function (a, b) { return a.num - b.num; });
            var min = g.files[0].num, max = g.files[g.files.length - 1].num;
            out.push({
                prefix: g.prefix, ext: g.ext, digits: g.digits,
                first: g.files[0].ref, firstName: g.files[0].name,
                count: g.files.length, min: min, max: max,
                gaps: (max - min + 1) - g.files.length
            });
        }
        out.sort(function (a, b) {
            var x = a.prefix + "." + a.ext, y = b.prefix + "." + b.ext;
            return x < y ? -1 : x > y ? 1 : 0;
        });
        return out;
    }

    // root 以下を探す。listDir(folderRef) → [{name, isFolder, ref}]
    // 戻り値: 連番に folder(ref) と folderName を付けたもの
    function findSequences(rootRef, listDir, maxDepth) {
        var limit = maxDepth == null ? MAX_DEPTH : maxDepth;
        var out = [];
        function walk(ref, name, depth) {
            var entries = listDir(ref);
            var seqs = groupSequences(entries);
            for (var i = 0; i < seqs.length; i++) {
                seqs[i].folder = ref;
                seqs[i].folderName = name;
                out.push(seqs[i]);
            }
            if (depth >= limit) return;
            var subs = [];
            for (var j = 0; j < entries.length; j++) {
                if (entries[j].isFolder && !skipFolder(entries[j].name)) subs.push(entries[j]);
            }
            subs.sort(byName);
            for (var s = 0; s < subs.length; s++) walk(subs[s].ref, subs[s].name, depth + 1);
        }
        walk(rootRef, "", 0);
        return out;
    }

    // 既に読み込まれているフッテージと同じ連番か
    // existing: {dir(正規化したフォルダパス), fileName, isStill}
    function sameSequence(seq, seqDir, existing) {
        if (existing.dir !== seqDir) return false;
        var p = parseName(existing.fileName);
        if (!p) return false;
        if (p.prefix.toLowerCase() !== seq.prefix.toLowerCase() || p.ext !== seq.ext) return false;
        return !existing.isStill || seq.count === 1;
    }

    function normalizePath(p) {
        return String(p || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
    }

    function isPremultiplied(ext) { return !!PREMULT_EXTS[String(ext).toLowerCase()]; }

    function label(seq) {
        var range = seq.count > 1 ? "[" + seq.min + "-" + seq.max + "]" : String(seq.min);
        return (seq.folderName ? seq.folderName + "/" : "") + seq.prefix + range + "." + seq.ext;
    }

    // 結果のメッセージ
    function summary(binName, added, reloaded, failed, gaps) {
        var msg = "「" + binName + "」に読み込みました\n\n"
            + "新しく読み込み: " + added.length + "件\n"
            + "再読み込み（読み込み済み）: " + reloaded.length + "件\n";
        if (failed.length) msg += "読み込めなかった: " + failed.length + "件\n  " + failed.slice(0, 10).join("\n  ") + "\n";
        if (gaps.length) msg += "\nフレームが抜けている連番:\n  " + gaps.slice(0, 10).join("\n  ") + (gaps.length > 10 ? "\n  …ほか" + (gaps.length - 10) + "件" : "") + "\n";
        return msg;
    }

    var ns = {
        parseName: parseName, groupSequences: groupSequences, findSequences: findSequences,
        sameSequence: sameSequence, normalizePath: normalizePath, isPremultiplied: isPremultiplied,
        label: label, summary: summary, skipFolder: skipFolder, skipFile: skipFile
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = ns;
    } else {
        global.BlRenderImportCore = ns;
    }

})(this);
