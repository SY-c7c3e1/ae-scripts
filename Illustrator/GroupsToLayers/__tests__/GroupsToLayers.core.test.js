// GroupsToLayers.core.test.js
// GroupsToLayers.core.js のロジックを、Illustrator本体を起動せずに検証するテスト。
// 実行: npm test （リポジトリ直下） または node --test このファイル

const assert = require("node:assert/strict");
const { test } = require("node:test");
const GroupsToLayersCore = require("../GroupsToLayers.core.js");

test("resolveLayerName: 名前があればそのまま使う", () => {
    const used = {};
    const name = GroupsToLayersCore.resolveLayerName("背景", "レイヤー1_1", used);
    assert.equal(name, "背景");
});

test("resolveLayerName: 名前が空ならフォールバック名を使う", () => {
    const used = {};
    const name = GroupsToLayersCore.resolveLayerName("", "レイヤー1_1", used);
    assert.equal(name, "レイヤー1_1");
});

test("resolveLayerName: 重複する名前には連番を付ける", () => {
    const used = {};
    const a = GroupsToLayersCore.resolveLayerName("キャラ", "x", used);
    const b = GroupsToLayersCore.resolveLayerName("キャラ", "x", used);
    const c = GroupsToLayersCore.resolveLayerName("キャラ", "x", used);
    assert.equal(a, "キャラ");
    assert.equal(b, "キャラ (2)");
    assert.equal(c, "キャラ (3)");
});

test("buildExecutionPlan: フォールバック名は前面から1,2,3...と採番される", () => {
    const groups = [{ name: "" }, { name: "" }, { name: "" }];
    const plan = GroupsToLayersCore.buildExecutionPlan(groups, "元レイヤー");

    // 命名自体は前面(index0)から 元レイヤー_1, _2, _3 の順で決まる
    const byIndex = {};
    plan.forEach((step) => { byIndex[step.groupIndex] = step.layerName; });
    assert.equal(byIndex[0], "元レイヤー_1");
    assert.equal(byIndex[1], "元レイヤー_2");
    assert.equal(byIndex[2], "元レイヤー_3");
});

test("buildExecutionPlan: 実行順序は背面(末尾)のグループから", () => {
    const groups = [{ name: "front" }, { name: "mid" }, { name: "back" }];
    const plan = GroupsToLayersCore.buildExecutionPlan(groups, "元レイヤー");

    assert.equal(plan.length, 3);
    assert.equal(plan[0].groupIndex, 2); // back を最初に処理
    assert.equal(plan[1].groupIndex, 1); // mid
    assert.equal(plan[2].groupIndex, 0); // front を最後に処理
});

test("buildExecutionPlan: 名前の重複はグループ間でも解決される", () => {
    const groups = [{ name: "A" }, { name: "A" }];
    const plan = GroupsToLayersCore.buildExecutionPlan(groups, "元レイヤー");
    const names = plan.map((s) => s.layerName).sort();
    assert.deepEqual(names, ["A", "A (2)"]);
});

test("flattenLayers: ネストしたレイヤーを深さ付きで平坦化する", () => {
    const tree = [
        { name: "L1", layers: [{ name: "L1-1", layers: [] }] },
        { name: "L2", layers: [] }
    ];
    tree.length = tree.length; // 配列そのものが .length を持つのでそのまま使える

    const flat = GroupsToLayersCore.flattenLayers(tree);
    assert.equal(flat.length, 3);
    assert.equal(flat[0].name, "L1");
    assert.equal(flat[0].depth, 0);
    assert.equal(flat[1].name, "L1-1");
    assert.equal(flat[1].depth, 1);
    assert.equal(flat[2].name, "L2");
    assert.equal(flat[2].depth, 0);
});

test("indentLabel: 深さに応じてインデントを付ける", () => {
    assert.equal(GroupsToLayersCore.indentLabel("A", 0), "A");
    assert.equal(GroupsToLayersCore.indentLabel("B", 2), "        B");
});
