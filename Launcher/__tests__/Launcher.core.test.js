// Launcher.core.test.js
// Launcher.core.js のスキャン結果グルーピングロジックを、実ファイルシステムなしで検証する。

const assert = require("node:assert/strict");
const { test } = require("node:test");
const LauncherCore = require("../Launcher.core.js");

function items(relPaths, rootIndex) {
    return relPaths.map(relPath => ({ relPath, rootIndex: rootIndex || 0 }));
}

const SAMPLE_ITEMS = items([
    "MarkerCopy/MarkerCopy.jsx",
    "SplitByDistance/SplitByDistance.jsx",
    "ExpressionToMatchName/C7_ExpressionToMatchName.jsx",
    "ExpressionToMatchName/C7_RevertToOriginalExpression.jsx",
    "testing/ae-mock.js",
    "Launcher/AEScriptsLauncher.jsx",
    "Launcher/Launcher.core.js",
    "Launcher/__tests__/Launcher.core.test.js",
    "MarkerCopy/__tests__/MarkerCopy.core.test.js",
    "README.md",
    ".git/HEAD"
]);

test("buildScriptList: フォルダ名をデフォルトのカテゴリ名として、.jsxのみグルーピングする", () => {
    const groups = LauncherCore.buildScriptList(SAMPLE_ITEMS, {});
    const categoryNames = groups.map(g => g.category).sort();
    assert.deepEqual(categoryNames, ["ExpressionToMatchName", "MarkerCopy", "SplitByDistance"]);

    const expr = groups.find(g => g.category === "ExpressionToMatchName");
    assert.equal(expr.scripts.length, 2);
});

test("buildScriptList: testing/Launcher/node_modules/.git 配下と__tests__配下は除外する", () => {
    const groups = LauncherCore.buildScriptList(SAMPLE_ITEMS, {});
    const allRelPaths = groups.flatMap(g => g.scripts.map(s => s.relPath));
    assert.ok(!allRelPaths.some(p => p.indexOf("testing/") === 0));
    assert.ok(!allRelPaths.some(p => p.indexOf("Launcher/") === 0));
    assert.ok(!allRelPaths.some(p => p.indexOf("__tests__/") !== -1));
    assert.ok(!allRelPaths.some(p => p.indexOf(".git") === 0));
});

test("buildScriptList: ルート直下の.jsx（フォルダに属さないもの）は対象外", () => {
    const groups = LauncherCore.buildScriptList(items(["standalone.jsx"]), {});
    assert.equal(groups.length, 0);
});

test("buildScriptList: categories でカテゴリ表示名を上書きできる", () => {
    const groups = LauncherCore.buildScriptList(SAMPLE_ITEMS, {
        categories: { MarkerCopy: "マーカー", SplitByDistance: "レイヤー分割" }
    });
    const names = groups.map(g => g.category).sort();
    assert.ok(names.includes("マーカー"));
    assert.ok(names.includes("レイヤー分割"));
    assert.ok(!names.includes("MarkerCopy"));
});

test("buildScriptList: order で指定したカテゴリ順になり、未指定は末尾にアルファベット順で並ぶ", () => {
    const groups = LauncherCore.buildScriptList(SAMPLE_ITEMS, {
        order: ["SplitByDistance", "MarkerCopy"]
    });
    const names = groups.map(g => g.category);
    assert.deepEqual(names, ["SplitByDistance", "MarkerCopy", "ExpressionToMatchName"]);
});

test("buildScriptList: labels で個別スクリプトの表示ラベルを上書きできる", () => {
    const groups = LauncherCore.buildScriptList(SAMPLE_ITEMS, {
        labels: { "ExpressionToMatchName/C7_ExpressionToMatchName.jsx": "Expression → MatchName 変換" }
    });
    const expr = groups.find(g => g.category === "ExpressionToMatchName");
    const target = expr.scripts.find(s => s.relPath === "ExpressionToMatchName/C7_ExpressionToMatchName.jsx");
    assert.equal(target.label, "Expression → MatchName 変換");

    const other = expr.scripts.find(s => s.relPath === "ExpressionToMatchName/C7_RevertToOriginalExpression.jsx");
    assert.equal(other.label, "C7_RevertToOriginalExpression"); // 上書きが無ければファイル名がそのままラベルになる
});

test("buildScriptList: バックスラッシュ区切りのパスも扱える（Windows想定）", () => {
    const groups = LauncherCore.buildScriptList(items(["MarkerCopy\\MarkerCopy.jsx"]), {});
    assert.equal(groups.length, 1);
    assert.equal(groups[0].scripts[0].relPath, "MarkerCopy/MarkerCopy.jsx");
});

test("buildScriptList: 複数rootの同名スクリプトでもrootIndexで区別して保持する", () => {
    const mixed = [
        { relPath: "MyTools/Foo.jsx", rootIndex: 0 },
        { relPath: "MyTools/Foo.jsx", rootIndex: 1 }
    ];
    const groups = LauncherCore.buildScriptList(mixed, {});
    const scripts = groups.find(g => g.category === "MyTools").scripts;
    assert.equal(scripts.length, 2);
    const rootIndexes = scripts.map(s => s.rootIndex).sort();
    assert.deepEqual(rootIndexes, [0, 1]);
});
