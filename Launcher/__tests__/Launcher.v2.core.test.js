// Launcher.core.js の追加機能（他人製フォルダ・使用回数・仮想カテゴリ・検索・設定マージ）のテスト
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../Launcher.core.js");

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 25);

const items = [
  { relPath: "Renamer/Renamer.jsx", rootIndex: 0, modified: NOW - 30 * DAY },
  { relPath: "BPMMaker/BPMMaker.jsx", rootIndex: 0, modified: NOW - 2 * DAY },
  { relPath: "ProjectSetup/C7_ProjectSetup.jsx", rootIndex: 0, modified: NOW - 1 * DAY },
  { relPath: "rootfile.jsx", rootIndex: 0 },                                   // 自作フォルダ直下 → 無視
  { relPath: "Text/GG_Bunkai.jsx", rootIndex: 1, thirdParty: true },
  { relPath: "00_Startup/Particular Migrator.jsx", rootIndex: 1, thirdParty: true },
  { relPath: "AutoSway.jsxbin", rootIndex: 2, thirdParty: true },             // 他人製フォルダ直下 → 拾う
  { relPath: "Mystery.jsx", rootIndex: 2, thirdParty: true },                 // カテゴリ未設定 → その他
  { relPath: "AEScriptsLauncher.jsx", rootIndex: 2, thirdParty: true },       // excludeFiles
  { relPath: "(Origami_packages)/basicSlice.jsxbin", rootIndex: 2, thirdParty: true }, // ()フォルダ → 無視
  { relPath: "Illustrator/GroupsToLayers/GroupsToLayers.jsx", rootIndex: 0 }, // excludeDirs
];

const config = {
  excludeDirs: ["Illustrator"],
  excludeFiles: ["AEScriptsLauncher.jsx"],
  categories: { Renamer: "ユーティリティ", ProjectSetup: "ユーティリティ", BPMMaker: "マーカー・音楽", Text: "テキスト", "00_Startup": "エフェクト・生成" },
  fileCategories: { "AutoSway.jsxbin": "配置・3D・モーション" },
  categoryOrder: ["テキスト", "マーカー・音楽", "エフェクト・生成", "配置・3D・モーション", "ユーティリティ"],
  labels: { "GG_Bunkai.jsx": "テキストを文字・単語・行に分解", "Renamer/Renamer.jsx": "一括リネーム" },
  startup: ["Particular Migrator.jsx", "C7_ProjectSetup.jsx"],
  initialUsage: { "GG_Bunkai.jsx": 5 },
};

test("他人製フォルダの直下ファイルを拾い、除外ルールを守る", () => {
  const groups = L.buildScriptList(items, config);
  const names = groups.map((g) => g.category);
  assert.deepEqual(names, ["テキスト", "マーカー・音楽", "エフェクト・生成", "配置・3D・モーション", "ユーティリティ", "その他"]);
  const all = groups.flatMap((g) => g.scripts.map((s) => s.relPath));
  assert.ok(all.includes("AutoSway.jsxbin"));
  assert.ok(!all.includes("rootfile.jsx"));
  assert.ok(!all.includes("AEScriptsLauncher.jsx"));
  assert.ok(!all.some((p) => p.includes("basicSlice")));
  assert.ok(!all.some((p) => p.includes("GroupsToLayers")));
});

test("ラベルは相対パス・ファイル名どちらのキーでも効き、他人製フラグが付く", () => {
  const groups = L.buildScriptList(items, config);
  const text = groups.find((g) => g.category === "テキスト").scripts[0];
  assert.equal(text.label, "テキストを文字・単語・行に分解");
  assert.equal(text.thirdParty, true);
  const util = groups.find((g) => g.category === "ユーティリティ").scripts;
  assert.ok(util.some((s) => s.label === "一括リネーム" && s.thirdParty === false));
});

test("使用回数の多い順にカテゴリ内が並ぶ", () => {
  const groups = L.buildScriptList(items, config);
  let usage = {};
  const setup = groups.find((g) => g.category === "ユーティリティ").scripts.find((s) => s.relPath.includes("ProjectSetup"));
  usage = L.recordUse(usage, setup, NOW);
  const sorted = L.applyUsage(groups, usage, config);
  assert.equal(sorted.find((g) => g.category === "ユーティリティ").scripts[0].relPath, "ProjectSetup/C7_ProjectSetup.jsx");
});

test("recordUse は元の usage を変更しない", () => {
  const before = { "a/a.jsx": { count: 1, last: 1 } };
  const after = L.recordUse(before, { relPath: "a/a.jsx" }, 5);
  assert.equal(before["a/a.jsx"].count, 1);
  assert.equal(after["a/a.jsx"].count, 2);
  assert.equal(after["a/a.jsx"].last, 5);
});

test("仮想カテゴリ：よく使う → 立ち上げ時 → 最近追加・更新", () => {
  const groups = L.buildScriptList(items, config);
  const v = L.buildVirtualGroups(groups, {}, config, NOW);
  assert.deepEqual(v.map((g) => g.category), [L.FREQUENT_CATEGORY, L.STARTUP_CATEGORY, L.RECENT_CATEGORY]);
  assert.deepEqual(v[0].scripts.map((s) => s.relPath), ["Text/GG_Bunkai.jsx"]); // initialUsage のみ
  assert.deepEqual(v[1].scripts.map((s) => s.relPath), ["00_Startup/Particular Migrator.jsx", "ProjectSetup/C7_ProjectSetup.jsx"]);
  assert.deepEqual(v[2].scripts.map((s) => s.relPath), ["ProjectSetup/C7_ProjectSetup.jsx", "BPMMaker/BPMMaker.jsx"]);
});

test("使ったことのあるものが無ければ「よく使う」は出ない", () => {
  const groups = L.buildScriptList(items, {});
  const v = L.buildVirtualGroups(groups, {}, {}, NOW);
  assert.ok(!v.some((g) => g.category === L.FREQUENT_CATEGORY));
});

test("検索は複数語・大文字小文字無視・ファイル名でもヒット", () => {
  const groups = L.buildScriptList(items, config);
  assert.deepEqual(L.searchScripts(groups, "bunkai", {}, config).map((s) => s.relPath), ["Text/GG_Bunkai.jsx"]);
  assert.deepEqual(L.searchScripts(groups, "テキスト　分解", {}, config).length, 1);
  assert.deepEqual(L.searchScripts(groups, "  ", {}, config), []);
});

test("設定ファイルのマージ", () => {
  const m = L.mergeConfigs([
    { categories: { A: "x" }, startup: ["a.jsx"], recentDays: 7 },
    null,
    { categories: { B: "y" }, startup: ["a.jsx", "b.jsx"], recentDays: 3 },
  ]);
  assert.deepEqual(m.categories, { A: "x", B: "y" });
  assert.deepEqual(m.startup, ["a.jsx", "b.jsx"]);
  assert.equal(m.recentDays, 3);
});

test("旧形式（自作フォルダのみ・order指定）は従来どおり", () => {
  const groups = L.buildScriptList(
    [{ relPath: "B/b.jsx", rootIndex: 0 }, { relPath: "A/a.jsx", rootIndex: 0 }, { relPath: "top.jsx", rootIndex: 0 }],
    { order: ["B", "A"] }
  );
  assert.deepEqual(groups.map((g) => g.category), ["B", "A"]);
});

test("frequentExclude：ファイル名・カテゴリ名で「よく使う」から外せる", () => {
  const cfg = { ...config, frequentExclude: ["テキスト"], initialUsage: { "GG_Bunkai.jsx": 5, "BPMMaker.jsx": 3 } };
  const groups = L.buildScriptList(items, cfg);
  const v = L.buildVirtualGroups(groups, {}, cfg, NOW);
  assert.deepEqual(v[0].scripts.map((s) => s.relPath), ["BPMMaker/BPMMaker.jsx"]);
  const cfg2 = { ...cfg, frequentExclude: ["BPMMaker.jsx", "テキスト"] };
  const v2 = L.buildVirtualGroups(L.buildScriptList(items, cfg2), {}, cfg2, NOW);
  assert.ok(!v2.some((g) => g.category === L.FREQUENT_CATEGORY));
});
