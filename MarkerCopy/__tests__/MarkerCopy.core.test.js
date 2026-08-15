// MarkerCopy.core.test.js
// MarkerCopy.core.js のロジックを、AE本体を起動せずに検証するテスト。
// 実行: npm test （リポジトリ直下） または node --test このファイル

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { MockMarkerValue, createMockMarkerProperty } = require("../../testing/ae-mock.js");

// MarkerCopy.core.js は buildMarkerValue() 内で `new MarkerValue(...)` を使うため、
// requireする前にグローバルへモックを差し込んでおく。
global.MarkerValue = MockMarkerValue;
const MarkerCopyCore = require("../MarkerCopy.core.js");

function marker(time, comment) {
    return { time: time, obj: { comment: comment, duration: 0, chapter: "", url: "", frameTarget: "", cuePointName: "", label: 0 } };
}

test("collectFromProp: プロパティからマーカー配列を取得できる", () => {
    const prop = createMockMarkerProperty([
        { time: 1, obj: { comment: "A" } },
        { time: 2, obj: { comment: "B" } }
    ]);
    const list = MarkerCopyCore.collectFromProp(prop);
    assert.equal(list.length, 2);
    assert.equal(list[0].obj.comment, "A");
    assert.equal(list[1].time, 2);
});

test("firstTime: マーカー群の最小時刻を返す", () => {
    assert.equal(MarkerCopyCore.firstTime([{ time: 5 }, { time: 2 }, { time: 8 }]), 2);
    assert.equal(MarkerCopyCore.firstTime([]), 0);
});

test("pasteToMarkerProp: keepExisting=false のとき既存マーカーを置き換える", () => {
    const dest = createMockMarkerProperty([{ time: 0, obj: { comment: "old" } }]);
    const src = [marker(3, "X"), marker(5, "Y")];

    const count = MarkerCopyCore.pasteToMarkerProp(dest, 10, 0, src, { usePosition: false, keepExisting: false });

    assert.equal(count, 2);
    assert.deepEqual(dest._dump().map(d => d.comment), ["X", "Y"]);
});

test("pasteToMarkerProp: keepExisting=true のとき既存マーカーを保持したまま追記する", () => {
    const dest = createMockMarkerProperty([{ time: 0, obj: { comment: "old" } }]);
    const src = [marker(3, "X")];

    MarkerCopyCore.pasteToMarkerProp(dest, 10, 0, src, { usePosition: false, keepExisting: true });

    const dump = dest._dump();
    assert.equal(dump.length, 2);
    assert.ok(dump.some(d => d.comment === "old"));
    assert.ok(dump.some(d => d.comment === "X"));
});

test("pasteToMarkerProp: usePosition=true のとき先頭マーカーをCTIへ合わせてシフトする", () => {
    const dest = createMockMarkerProperty([]);
    const src = [marker(10, "X"), marker(12, "Y")];

    MarkerCopyCore.pasteToMarkerProp(dest, 20, 0, src, { usePosition: true, keepExisting: false });

    const dump = dest._dump();
    assert.equal(dump[0].time, 20); // firstTime=10, destCti=20 -> shift=10
    assert.equal(dump[1].time, 22);
});

test("pasteToMarkerProp: layerOffset の分だけ時刻を差し引く", () => {
    const dest = createMockMarkerProperty([]);
    const src = [marker(10, "X")];

    MarkerCopyCore.pasteToMarkerProp(dest, 0, 3, src, { usePosition: false, keepExisting: false });

    assert.equal(dest._dump()[0].time, 7);
});
