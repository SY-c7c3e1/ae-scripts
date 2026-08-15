// ae-mock.js
// After Effects ExtendScript API の軽量モック集。
// AE本体を起動せずに、各スクリプトの *.core.js（UI非依存のロジック本体）を
// Node上でテストするために使う。フルモックではなく、テストで必要になった
// API だけを実装していく方針（必要になったら追加する）。

// ── MarkerValue ──────────────────────────────────────────────
class MockMarkerValue {
    constructor(comment) {
        this.comment = comment || "";
        this.duration = 0;
        this.chapter = "";
        this.url = "";
        this.frameTarget = "";
        this.cuePointName = "";
        this.label = 0;
    }
}

// マーカー用プロパティ（layer.property("Marker") / comp.markerProperty）のモック。
// initial: [{ time, obj: {comment, duration, chapter, url, frameTarget, cuePointName, label} }]
function createMockMarkerProperty(initial) {
    var keys = (initial || []).map(function (m) {
        var mv = new MockMarkerValue(m.obj.comment);
        for (var k in m.obj) { if (m.obj.hasOwnProperty(k)) mv[k] = m.obj[k]; }
        return { time: m.time, value: mv };
    });
    keys.sort(function (a, b) { return a.time - b.time; });

    return {
        get numKeys() { return keys.length; },
        keyTime: function (k) { return keys[k - 1].time; },
        keyValue: function (k) { return keys[k - 1].value; },
        removeKey: function (k) { keys.splice(k - 1, 1); },
        setValueAtTime: function (time, value) {
            keys.push({ time: time, value: value });
            keys.sort(function (a, b) { return a.time - b.time; });
        },
        // テスト用ヘルパー（AE本物のAPIには存在しない）
        _dump: function () {
            return keys.map(function (k) {
                return { time: k.time, comment: k.value.comment };
            });
        }
    };
}

module.exports = {
    MockMarkerValue: MockMarkerValue,
    createMockMarkerProperty: createMockMarkerProperty
};
