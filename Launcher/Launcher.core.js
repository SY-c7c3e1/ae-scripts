// Launcher.core.js
// AEScriptsLauncher.jsx のロジック本体（UI・実ファイルシステム非依存）。
//
// AEScriptsLauncher.jsx 側は「リポジトリ内の .jsx を再帰的に探す」という
// 実ファイルシステムへのアクセスだけを担当し、見つけた相対パスの配列を
// ここに渡す。ここでは、それをカテゴリごとにグルーピング・並び替え・
// 除外フォルダのフィルタリングだけを行う（純粋なロジックなのでNodeでテスト可能）。
//
// ExtendScript側からは #include で読み込み、テスト側からは Node の
// require() で読み込む。

(function (global) {

    var DEFAULT_EXCLUDE_DIRS = ["testing", "Launcher", "node_modules", ".git"];

    function contains(arr, value) {
        for (var i = 0; i < arr.length; i++) if (arr[i] === value) return true;
        return false;
    }

    // relPaths: ["MarkerCopy/MarkerCopy.jsx", ...]（区切りは "/" か "\\" どちらでもよい）
    // config（省略可）:
    //   excludeDirs: string[]                 — 走査結果から除外するトップフォルダ名（デフォルトに追加）
    //   categories:  { フォルダ名: 表示カテゴリ名 }
    //   order:       string[]                 — フォルダ名でのカテゴリ表示順。未記載のものはアルファベット順で末尾に
    //   labels:      { "フォルダ名/ファイル名.jsx": 表示ラベル }
    //
    // 戻り値: [{ category: string, scripts: [{ label: string, relPath: string }] }]
    function buildScriptList(relPaths, config) {
        config = config || {};
        var excludeDirs = DEFAULT_EXCLUDE_DIRS.concat(config.excludeDirs || []);
        var categories = config.categories || {};
        var order = config.order || [];
        var labels = config.labels || {};

        var groups = {}; // topFolder -> { category, scripts: [] }

        for (var i = 0; i < relPaths.length; i++) {
            var relPath = relPaths[i].replace(/\\/g, "/");
            if (!/\.jsx$/i.test(relPath)) continue;
            if (relPath.indexOf("__tests__/") !== -1) continue;

            var segments = relPath.split("/");
            if (segments.length < 2) continue; // ルート直下のファイルは対象外（フォルダ配下のみ拾う）

            var topFolder = segments[0];
            if (topFolder.charAt(0) === ".") continue;
            if (contains(excludeDirs, topFolder)) continue;

            var fileBase = segments[segments.length - 1].replace(/\.jsx$/i, "");
            var label = labels[relPath] || fileBase;
            var categoryName = categories[topFolder] || topFolder;

            if (!groups[topFolder]) {
                groups[topFolder] = { category: categoryName, scripts: [] };
            }
            groups[topFolder].scripts.push({ label: label, relPath: relPath });
        }

        var keys = [];
        for (var k in groups) { if (groups.hasOwnProperty(k)) keys.push(k); }

        keys.sort(function (a, b) {
            var ia = order.indexOf ? order.indexOf(a) : -1;
            var ib = order.indexOf ? order.indexOf(b) : -1;
            if (ia === -1 && ib === -1) return a < b ? -1 : (a > b ? 1 : 0);
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
        });

        var result = [];
        for (var j = 0; j < keys.length; j++) {
            var g = groups[keys[j]];
            g.scripts.sort(function (a, b) { return a.label < b.label ? -1 : (a.label > b.label ? 1 : 0); });
            result.push({ category: g.category, scripts: g.scripts });
        }
        return result;
    }

    var ns = {
        buildScriptList: buildScriptList
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = ns;
    } else {
        global.LauncherCore = ns;
    }

})(this);
