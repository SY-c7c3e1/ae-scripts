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
//
// カテゴリのグルーピングは「表示カテゴリ名」単位で行う。複数のフォルダを
// categories.json で同じカテゴリ名に上書きした場合、それらは1つのカテゴリ
// （ドロップダウンの1項目）にまとめられる（例: AutoCropComposition と
// CropLayersToCompSize を両方「クロップ」にすると、1つの「クロップ」の
// 中に両方のスクリプトが並ぶ）。order はフォルダ名で指定するが、複数
// フォルダが1カテゴリにまとまった場合は、その中で最小のorder位置が
// カテゴリ全体の並び順として使われる。
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
    //   categories:  { フォルダ名: 表示カテゴリ名 }        — 同じ表示名にした複数フォルダは1カテゴリに統合される
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

        var groups = {}; // categoryName -> { scripts: [], orderRank: number }

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
            var orderIdx = order.indexOf ? order.indexOf(topFolder) : -1;
            var orderRank = (orderIdx === -1) ? Number.MAX_VALUE : orderIdx;

            if (!groups[categoryName]) {
                groups[categoryName] = { scripts: [], orderRank: orderRank };
            } else if (orderRank < groups[categoryName].orderRank) {
                groups[categoryName].orderRank = orderRank;
            }
            groups[categoryName].scripts.push({ label: label, relPath: relPath, rootIndex: item.rootIndex });
        }

        var keys = [];
        for (var k in groups) { if (groups.hasOwnProperty(k)) keys.push(k); }

        keys.sort(function (a, b) {
            var ra = groups[a].orderRank, rb = groups[b].orderRank;
            if (ra === rb) return a < b ? -1 : (a > b ? 1 : 0);
            return ra - rb;
        });

        var result = [];
        for (var j = 0; j < keys.length; j++) {
            var g = groups[keys[j]];
            g.scripts.sort(function (a, b) { return a.label < b.label ? -1 : (a.label > b.label ? 1 : 0); });
            result.push({ category: keys[j], scripts: g.scripts });
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
