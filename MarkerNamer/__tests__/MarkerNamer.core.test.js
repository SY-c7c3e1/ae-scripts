// MarkerNamer.core.test.js
// MarkerNamer.core.js のロジックを、AE本体を起動せずに検証するテスト。
// 実行: npm test （リポジトリ直下） または node --test このファイル

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createMockMarkerProperty } = require("../../testing/ae-mock.js");
const Core = require("../MarkerNamer.core.js");

const OPTS = { noNumber: ["atk"], digits: 2 };

function prop(times) {
    return createMockMarkerProperty(times.map((t) => ({ time: t, obj: { comment: "", label: 3, duration: 1 } })));
}
function names(mk) {
    return mk._dump().map((m) => m.comment);
}

test("stripNumber: 先頭の連番だけを外す", () => {
    assert.equal(Core.stripNumber("01_intro"), "intro");
    assert.equal(Core.stripNumber("1A"), "1A");
    assert.equal(Core.stripNumber("12_2B"), "2B");
});

test("isNoNumber: 大文字小文字を区別しない", () => {
    assert.equal(Core.isNoNumber("ATK", ["atk"]), true);
    assert.equal(Core.isNoNumber("1A", ["atk"]), false);
});

test("currentIndex: CTI上・直後・先頭より前", () => {
    const mk = prop([0, 10, 20]);
    const fd = 1 / 30;
    assert.equal(Core.currentIndex(mk, 10, fd), 2);          // ちょうど上
    assert.equal(Core.currentIndex(mk, 15, fd), 2);          // 直後
    assert.equal(Core.currentIndex(mk, 20 - fd * 0.4, fd), 3); // 半フレーム以内は同じ位置
    assert.equal(Core.currentIndex(prop([5, 10]), 0, fd), 1); // 先頭より前 → 1
    assert.equal(Core.currentIndex(prop([]), 0, fd), 0);
});

test("setName: 順に付けると連番が振られ、空欄とatkは数えない", () => {
    const mk = prop([0, 10, 20, 25, 30, 40, 50]);
    ["intro", "1A", "", "atk", "1B", "1C", "outro"].forEach((n, i) => {
        if (n !== "") Core.setName(mk, i + 1, n, OPTS);
    });
    assert.deepEqual(names(mk), ["01_intro", "02_1A", "", "atk", "03_1B", "04_1C", "05_outro"]);
});

test("setName: 消去すると後ろが詰めて振り直される", () => {
    const mk = prop([0, 10, 20, 30]);
    ["intro", "1A", "1B", "outro"].forEach((n, i) => Core.setName(mk, i + 1, n, OPTS));
    Core.setName(mk, 2, "", OPTS);
    assert.deepEqual(names(mk), ["01_intro", "", "02_1B", "03_outro"]);
});

test("setName: 途中に差し込むと後ろの番号がずれる", () => {
    const mk = prop([0, 10, 20]);
    Core.setName(mk, 1, "intro", OPTS);
    Core.setName(mk, 3, "1B", OPTS);
    Core.setName(mk, 2, "1A", OPTS);
    assert.deepEqual(names(mk), ["01_intro", "02_1A", "03_1B"]);
});

test("setName: 番号付きの名前で上書きしても二重に番号が付かない", () => {
    const mk = prop([0]);
    Core.setName(mk, 1, "05_intro", OPTS);
    assert.deepEqual(names(mk), ["01_intro"]);
});

test("renumber: マーカーの色・長さは変わらない", () => {
    const mk = prop([0, 10]);
    Core.setName(mk, 1, "intro", OPTS);
    assert.equal(mk.keyValue(1).label, 3);
    assert.equal(mk.keyValue(1).duration, 1);
});

test("renumber: 桁数の設定が効く", () => {
    const mk = prop([0]);
    Core.setName(mk, 1, "intro", { noNumber: [], digits: 3 });
    assert.deepEqual(names(mk), ["001_intro"]);
});

// ── セクション（A/B/C）の番号自動付与 ─────────────────────────
const SOPTS = { noNumber: ["atk"], digits: 2, roundLetters: ["A", "B", "C"] };

// 押した順にマーカーへ付けていき、最終的な名前を返す
function pressInOrder(keys) {
    const mk = prop(keys.map((_, i) => i * 10));
    keys.forEach((k, i) => {
        const name = (k.length === 1) ? Core.resolveSection(mk, i + 1, k, SOPTS) : k;
        Core.setName(mk, i + 1, name, SOPTS);
    });
    return names(mk).map(Core.stripNumber);
}

test("resolveSection: A B C A B C D C → 1A 1B 1C 2A 2B 2C D 3C", () => {
    assert.deepEqual(
        pressInOrder(["A", "B", "C", "A", "B", "C", "D", "C"]),
        ["1A", "1B", "1C", "2A", "2B", "2C", "D", "3C"]
    );
});

test("resolveSection: intro や atk・空欄を挟んでも番号が続く", () => {
    assert.deepEqual(
        pressInOrder(["intro", "A", "B", "atk", "C", "Theme", "A", "C", "outro"]),
        ["intro", "1A", "1B", "atk", "1C", "Theme", "2A", "2C", "outro"]
    );
});

test("resolveSection: D・E は番号なし", () => {
    assert.deepEqual(pressInOrder(["A", "D", "E", "B"]), ["1A", "D", "E", "1B"]);
});

test("resolveSection: 同じ文字が続くと次の番号になる", () => {
    assert.deepEqual(pressInOrder(["C", "C", "C"]), ["1C", "2C", "3C"]);
});

test("resolveSection: 前のマーカーだけを見る（途中の付け直し）", () => {
    const mk = prop([0, 10, 20, 30]);
    ["1A", "1B", "2A", "2B"].forEach((n, i) => Core.setName(mk, i + 1, n, SOPTS));
    // 3番目を見直す: 前は 1B → A は次の番号
    assert.equal(Core.resolveSection(mk, 3, "A", SOPTS), "2A");
    // 2番目を見直す: 前は 1A → C は同じ番号
    assert.equal(Core.resolveSection(mk, 2, "C", SOPTS), "1C");
    // 先頭: 前に何もない
    assert.equal(Core.resolveSection(mk, 1, "B", SOPTS), "1B");
});

test("resolveSection: 2桁の番号も扱える", () => {
    const mk = prop([0, 10]);
    Core.setName(mk, 1, "10C", SOPTS);
    assert.equal(Core.resolveSection(mk, 2, "A", SOPTS), "11A");
});
