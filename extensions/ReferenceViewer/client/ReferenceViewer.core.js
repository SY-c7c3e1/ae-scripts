// ReferenceViewer.core.js
// Reference Viewer（CEPパネル）のロジック本体（UI・AE非依存）。
//
// パネル（client/main.js）からは <script> で読み込み、
// テスト（__tests__/ReferenceViewer.core.test.js）からは Node の require() で読み込む。
//
// 扱うデータ（プロジェクトの .aep 内に JSON 文字列として保存される）:
//   {
//     version: 1,
//     items: [
//       { id, type: "file", name, path, relPath },   // relPath は .aep のあるフォルダからの相対パス
//       { id, type: "link", name, url }
//     ],
//     memo: ""
//   }

(function (global) {

    var DATA_VERSION = 1;

    var IMAGE_EXT = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"];
    var PDF_EXT   = ["pdf"];
    var TEXT_EXT  = ["txt", "md", "csv", "srt", "lrc"];
    // AEで読み込める（フッテージとして _Reference に入れられる）もの
    var AE_IMPORTABLE_EXT = [
        "jpg", "jpeg", "png", "gif", "bmp", "tif", "tiff", "tga", "psd", "ai", "eps", "pdf",
        "exr", "hdr", "dpx", "webp", "heic",
        "mov", "mp4", "m4v", "avi", "mxf", "webm",
        "wav", "mp3", "aif", "aiff", "m4a"
    ];

    function contains(arr, v) {
        for (var i = 0; i < arr.length; i++) if (arr[i] === v) return true;
        return false;
    }

    function createEmptyData() {
        return { version: DATA_VERSION, items: [], memo: "" };
    }

    // 保存されていた文字列 → データ。壊れていたり空なら空データを返す。
    function parseData(str) {
        var data = createEmptyData();
        if (!str) return data;
        var obj;
        try { obj = JSON.parse(str); } catch (e) { return data; }
        if (!obj || typeof obj !== "object") return data;

        if (typeof obj.memo === "string") data.memo = obj.memo;
        var items = obj.items instanceof Array ? obj.items : [];
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (!it || typeof it !== "object") continue;
            if (it.type === "file" && typeof it.path === "string" && it.path) {
                data.items.push({
                    id: String(it.id || newId()),
                    type: "file",
                    name: String(it.name || basename(it.path)),
                    path: it.path,
                    relPath: typeof it.relPath === "string" ? it.relPath : ""
                });
            } else if (it.type === "link" && typeof it.url === "string" && it.url) {
                data.items.push({
                    id: String(it.id || newId()),
                    type: "link",
                    name: String(it.name || it.url),
                    url: it.url
                });
            }
        }
        return data;
    }

    function serializeData(data) {
        return JSON.stringify({ version: DATA_VERSION, items: data.items, memo: data.memo });
    }

    var idCounter = 0;
    function newId() {
        idCounter++;
        return new Date().getTime().toString(36) + "-" + idCounter.toString(36) +
               "-" + Math.floor(Math.random() * 1e6).toString(36);
    }

    // ---------- パス操作（Windows / Mac 両対応。区切りは "/" に統一して扱う） ----------

    function normalizePath(p) {
        return String(p || "").replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function isWindowsPath(p) {
        return /^[A-Za-z]:\//.test(normalizePath(p)) || /^\/\/[^\/]/.test(normalizePath(p));
    }

    function basename(p) {
        var n = normalizePath(p);
        return n.substring(n.lastIndexOf("/") + 1);
    }

    function dirname(p) {
        var n = normalizePath(p);
        var i = n.lastIndexOf("/");
        return i <= 0 ? n.substring(0, i + 1) : n.substring(0, i);
    }

    function extname(p) {
        var b = basename(p);
        var i = b.lastIndexOf(".");
        return i <= 0 ? "" : b.substring(i + 1).toLowerCase();
    }

    // fromDir（フォルダ）から toFile への相対パス。
    // ドライブが違うなど相対にできない場合は "" を返す。
    function relativePath(fromDir, toFile) {
        if (!fromDir || !toFile) return "";
        var a = normalizePath(fromDir).split("/");
        var b = normalizePath(toFile).split("/");
        var caseInsensitive = isWindowsPath(fromDir);
        function same(x, y) { return caseInsensitive ? x.toLowerCase() === y.toLowerCase() : x === y; }

        if (!same(a[0], b[0])) return ""; // 別ドライブ
        var i = 0;
        while (i < a.length && i < b.length - 1 && same(a[i], b[i])) i++;
        var up = [];
        for (var j = i; j < a.length; j++) up.push("..");
        return up.concat(b.slice(i)).join("/");
    }

    function joinPath(dir, rel) {
        var parts = normalizePath(dir).split("/");
        var relParts = normalizePath(rel).split("/");
        for (var i = 0; i < relParts.length; i++) {
            var s = relParts[i];
            if (s === "" || s === ".") continue;
            if (s === "..") { if (parts.length > 1) parts.pop(); }
            else parts.push(s);
        }
        return parts.join("/");
    }

    // ---------- 種類の判定 ----------

    // "image" | "pdf" | "text" | "other"
    function fileKind(p) {
        var e = extname(p);
        if (contains(IMAGE_EXT, e)) return "image";
        if (contains(PDF_EXT, e)) return "pdf";
        if (contains(TEXT_EXT, e)) return "text";
        return "other";
    }

    function isAeImportable(p) {
        return contains(AE_IMPORTABLE_EXT, extname(p));
    }

    // ---------- 一覧の編集 ----------

    function samePath(a, b) {
        var na = normalizePath(a), nb = normalizePath(b);
        return isWindowsPath(na) ? na.toLowerCase() === nb.toLowerCase() : na === nb;
    }

    // 追加したアイテムの配列を返す（すでに登録済みのパスはスキップ）
    function addFiles(data, paths, projectDir) {
        var added = [];
        for (var i = 0; i < paths.length; i++) {
            var p = paths[i];
            if (!p) continue;
            var dup = false;
            for (var j = 0; j < data.items.length; j++) {
                if (data.items[j].type === "file" && samePath(data.items[j].path, p)) { dup = true; break; }
            }
            if (dup) continue;
            var item = {
                id: newId(),
                type: "file",
                name: basename(p),
                path: normalizePath(p),
                relPath: projectDir ? relativePath(projectDir, p) : ""
            };
            data.items.push(item);
            added.push(item);
        }
        return added;
    }

    // "example.com" のようにスキーム無しなら https:// を補う
    function normalizeUrl(url) {
        var u = String(url || "").replace(/^\s+|\s+$/g, "");
        if (!u) return "";
        if (!/^[a-z][a-z0-9+.\-]*:/i.test(u)) u = "https://" + u;
        return u;
    }

    function addLink(data, name, url) {
        var u = normalizeUrl(url);
        if (!u) return null;
        var n = String(name || "").replace(/^\s+|\s+$/g, "");
        var item = { id: newId(), type: "link", name: n || u, url: u };
        data.items.push(item);
        return item;
    }

    function indexOfId(data, id) {
        for (var i = 0; i < data.items.length; i++) if (data.items[i].id === id) return i;
        return -1;
    }

    function removeItem(data, id) {
        var i = indexOfId(data, id);
        if (i === -1) return false;
        data.items.splice(i, 1);
        return true;
    }

    function renameItem(data, id, name) {
        var i = indexOfId(data, id);
        var n = String(name || "").replace(/^\s+|\s+$/g, "");
        if (i === -1 || !n) return false;
        data.items[i].name = n;
        return true;
    }

    // id のアイテムを toIndex の位置へ（移動後の位置）
    function moveItem(data, id, toIndex) {
        var from = indexOfId(data, id);
        if (from === -1) return false;
        var to = Math.max(0, Math.min(toIndex, data.items.length - 1));
        if (from === to) return false;
        var it = data.items.splice(from, 1)[0];
        data.items.splice(to, 0, it);
        return true;
    }

    // ファイルの場所の候補（先に見つかったものを使う）。
    // 1. 登録時の絶対パス  2. .aep からの相対パス（プロジェクトごとフォルダを移動・受け渡しした場合）
    function resolveCandidates(item, projectDir) {
        var c = [];
        if (item.path) c.push(normalizePath(item.path));
        if (item.relPath && projectDir) {
            var r = joinPath(projectDir, item.relPath);
            if (!contains(c, r)) c.push(r);
        }
        return c;
    }

    var ns = {
        createEmptyData: createEmptyData,
        parseData: parseData,
        serializeData: serializeData,
        newId: newId,
        normalizePath: normalizePath,
        basename: basename,
        dirname: dirname,
        extname: extname,
        relativePath: relativePath,
        joinPath: joinPath,
        fileKind: fileKind,
        isAeImportable: isAeImportable,
        normalizeUrl: normalizeUrl,
        addFiles: addFiles,
        addLink: addLink,
        removeItem: removeItem,
        renameItem: renameItem,
        moveItem: moveItem,
        resolveCandidates: resolveCandidates
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = ns;
    }
    // CEPパネル（Node有効）では module も定義されるため、常にグローバルにも生やす
    if (global) global.ReferenceViewerCore = ns;

})(this);
