// Launcher.core.js
// AEScriptsLauncher.jsx のロジック本体（UI・実ファイルシステム非依存）。
//
// AEScriptsLauncher.jsx 側は「設定済みの各フォルダ（root）内の .jsx を
// 再帰的に探す」という実ファイルシステムへのアクセスだけを担当し、見つけた
// 相対パス＋どのrootから見つかったか（rootIndex）を配列にしてここに渡す。
// ここでは、それをカテゴリごとにグルーピング・並び替え・除外フォルダの
// フィルタリングだけを行う（純粋なロジックなのでNodeでテスト可能）。
//
// 複数root対応：他の人が作ったスクリプト等、git管理下のリポジトリとは
// 別の非公開フォルダも追加でスキャン対象にできるようにするため、
// 1つのフラットな相対パス配列ではなく { relPath, rootIndex } の配列を扱う。
// カテゴリ名・ラベルの上書き設定（categories.json）はフォルダ名をキーにする
// ため、rootをまたいでも同じフォルダ名なら同じ設定が適用される。
//
// ExtendScript側からは実行時に $.evalFile で読み込み、テスト側からは
// Node の require() で読み込む（詳細は testing/README.md）。

(function (global) {

    var DEFAULT_EXCLUDE_DIRS = ["testing", "Launcher", "node_modules", ".git"];

    function contains(arr, value) {
        for (var i = 0; i < arr.length; i++) if (arr[i] === value) return true;
        return false;
    }

    // items: [{ relPath: "MarkerCopy/MarkerCopy.jsx", rootIndex: 0 }, ...]
    //   relPath の区切りは "/" か "\\" どちらでもよい
    // config（省略可）:
    //   excludeDirs: string[]                 — 走査結果から除外するトップフォルダ名（デフォルトに追加）
    //   categories:  { フォルダ名: 表示カテゴリ名 }
    //   order:       string[]                 — フォルダ名でのカテゴリ表示順。未記載のものはアルファベット順で末尾に
    //   labels:      { "フォルダ名/ファイル名.jsx": 表示ラベル }
    //
    // 戻り値: [{ category: string, scripts: [{ label: string, relPath: string, rootIndex: number }] }]
    function buildScriptList(items, config) {
        config = config || {};
        var excludeDirs = DEFAULT_EXCLUDE_DIRS.concat(config.excludeDirs || []);
        var categories = config.categories || {};
        var order = config.order || [];
        var labels = config.labels || {};

        var groups = {}; // topFolder -> { category, scripts: [] }

        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var relPath = item.relPath.replace(/\\/g, "/");
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
            groups[topFolder].scripts.push({ label: label, relPath: relPath, rootIndex: item.rootIndex });
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
