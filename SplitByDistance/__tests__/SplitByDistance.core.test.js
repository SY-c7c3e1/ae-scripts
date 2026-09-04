// SplitByDistance.core.test.js
// SplitByDistance.core.js のロジックを、AE本体を起動せずに検証するテスト。
// 実行: npm test （リポジトリ直下） または node --test このファイル

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createMockValueProperty } = require("../../testing/ae-mock.js");
const Core = require("../SplitByDistance.core.js");

function identityChain(overrides) {
    return [Object.assign({
        anchor: [0, 0, 0],
        position: [0, 0, 0],
        scale: [100, 100, 100],
        rotation: 0,
        threeDLayer: false
    }, overrides || {})];
}

function closeTo(actual, expected, epsilon) {
    return Math.abs(actual - expected) < (epsilon || 1e-9);
}

// ── pad / digitsForCount / buildCompName ──────────────────────────

test("pad: 指定桁数までゼロ埋めする（超える場合はそのまま）", () => {
    assert.equal(Core.pad(1, 2), "01");
    assert.equal(Core.pad(12, 2), "12");
    assert.equal(Core.pad(123, 2), "123");
});

test("digitsForCount: 最低2桁、件数が多ければ桁数を増やす", () => {
    assert.equal(Core.digitsForCount(5), 2);
    assert.equal(Core.digitsForCount(150), 3);
});

test("buildCompName: 接頭辞 + 連番", () => {
    assert.equal(Core.buildCompName("Foo", 3, 2), "Foo_03");
});

// ── transformPointThroughChain ─────────────────────────────────────

test("transformPointThroughChain: 恒等変換は座標を変えない", () => {
    const r = Core.transformPointThroughChain(identityChain(), [10, 20]);
    assert.deepEqual(r.point, [10, 20]);
    assert.equal(r.used3D, false);
});

test("transformPointThroughChain: position による平行移動", () => {
    const r = Core.transformPointThroughChain(identityChain({ position: [50, 60, 0] }), [10, 20]);
    assert.deepEqual(r.point, [60, 80]);
});

test("transformPointThroughChain: anchorPoint はその点を原点にずらす", () => {
    const r = Core.transformPointThroughChain(identityChain({ anchor: [5, 5, 0] }), [5, 5]);
    assert.deepEqual(r.point, [0, 0]);
});

test("transformPointThroughChain: scale で拡大される", () => {
    const r = Core.transformPointThroughChain(identityChain({ scale: [200, 200, 100] }), [10, 10]);
    assert.deepEqual(r.point, [20, 20]);
});

test("transformPointThroughChain: 90度回転", () => {
    const r = Core.transformPointThroughChain(identityChain({ rotation: 90 }), [10, 0]);
    assert.ok(closeTo(r.point[0], 0, 1e-6), "x should be ~0, got " + r.point[0]);
    assert.ok(closeTo(r.point[1], 10, 1e-6), "y should be ~10, got " + r.point[1]);
});

test("transformPointThroughChain: 親チェーンを2階層たどって合成される", () => {
    const chain = [
        { anchor: [0, 0, 0], position: [10, 10, 0], scale: [100, 100, 100], rotation: 0, threeDLayer: false },
        { anchor: [0, 0, 0], position: [100, 100, 0], scale: [100, 100, 100], rotation: 0, threeDLayer: false }
    ];
    const r = Core.transformPointThroughChain(chain, [0, 0]);
    assert.deepEqual(r.point, [110, 110]);
});

test("transformPointThroughChain: threeDLayerが含まれるとused3D=trueになる", () => {
    const r = Core.transformPointThroughChain(identityChain({ threeDLayer: true }), [0, 0]);
    assert.equal(r.used3D, true);
});

// ── aabbFromLocalRect ───────────────────────────────────────────────

test("aabbFromLocalRect: 恒等変換では矩形がそのままAABBになる", () => {
    const box = Core.aabbFromLocalRect(identityChain(), { left: 0, top: 0, right: 100, bottom: 50 });
    assert.deepEqual(box, { left: 0, top: 0, right: 100, bottom: 50, used3D: false });
});

test("aabbFromLocalRect: 90度回転すると幅と高さが入れ替わったAABBになる", () => {
    const box = Core.aabbFromLocalRect(identityChain({ rotation: 90 }), { left: 0, top: 0, right: 100, bottom: 50 });
    assert.ok(closeTo(box.right - box.left, 50, 1e-6));
    assert.ok(closeTo(box.bottom - box.top, 100, 1e-6));
});

// ── bboxFromVertices ────────────────────────────────────────────────

test("bboxFromVertices: 頂点群からバウンディングボックスを求める", () => {
    const box = Core.bboxFromVertices([[10, 20], [50, 5], [30, 60], [-5, 40]]);
    assert.deepEqual(box, { left: -5, top: 5, right: 50, bottom: 60 });
});

test("bboxFromVertices: 頂点1つでも動作する", () => {
    const box = Core.bboxFromVertices([[7, 9]]);
    assert.deepEqual(box, { left: 7, top: 9, right: 7, bottom: 9 });
});

// ── boxDistance ───────────────────────────────────────────────────

test("boxDistance: 重なっているボックスは距離0", () => {
    assert.equal(Core.boxDistance({ left: 0, top: 0, right: 10, bottom: 10 }, { left: 5, top: 5, right: 15, bottom: 15 }), 0);
});

test("boxDistance: 接しているボックスは距離0", () => {
    assert.equal(Core.boxDistance({ left: 0, top: 0, right: 10, bottom: 10 }, { left: 10, top: 0, right: 20, bottom: 10 }), 0);
});

test("boxDistance: 横方向に離れている場合はそのギャップが距離になる", () => {
    assert.equal(Core.boxDistance({ left: 0, top: 0, right: 10, bottom: 10 }, { left: 20, top: 0, right: 30, bottom: 10 }), 10);
});

test("boxDistance: 斜め方向はユークリッド距離になる", () => {
    const d = Core.boxDistance({ left: 0, top: 0, right: 10, bottom: 10 }, { left: 20, top: 20, right: 30, bottom: 30 });
    assert.ok(closeTo(d, Math.sqrt(200), 1e-9));
});

// ── clusterByDistance ───────────────────────────────────────────────

function findClusterContaining(clusters, indexValue) {
    return clusters.find(c => c.includes(indexValue));
}

test("clusterByDistance: しきい値内のボックス同士は同じグループになる", () => {
    const boxes = [
        { left: 0, top: 0, right: 10, bottom: 10 },   // A
        { left: 15, top: 0, right: 25, bottom: 10 },  // B (Aとのギャップ5)
        { left: 100, top: 0, right: 110, bottom: 10 } // C (遠い)
    ];
    const clusters = Core.clusterByDistance(boxes, 10);
    assert.equal(clusters.length, 2);
    const abCluster = findClusterContaining(clusters, 0);
    assert.ok(abCluster.includes(1));
    assert.ok(!abCluster.includes(2));
});

test("clusterByDistance: 連結はチェーン状に伝播する（A-C間は遠くてもA-B-Cで繋がる）", () => {
    const boxes = [
        { left: 0, top: 0, right: 10, bottom: 10 },   // A
        { left: 15, top: 0, right: 25, bottom: 10 },  // B (Aとのギャップ5)
        { left: 30, top: 0, right: 40, bottom: 10 }   // C (Bとのギャップ5、Aとのギャップは20)
    ];
    const clusters = Core.clusterByDistance(boxes, 8);
    assert.equal(clusters.length, 1);
    assert.equal(clusters[0].length, 3);
});

// ── unionBox / computeCompLayout ───────────────────────────────────

test("unionBox: 複数ボックスの外接矩形を求める", () => {
    const boxes = [
        { left: 0, top: 0, right: 10, bottom: 10 },
        { left: 5, top: -5, right: 20, bottom: 8 }
    ];
    assert.deepEqual(Core.unionBox(boxes, [0, 1]), { left: 0, top: -5, right: 20, bottom: 10 });
});

test("computeCompLayout: 余白を含めたサイズとオフセットを計算する", () => {
    const layout = Core.computeCompLayout({ left: 0, top: 0, right: 100, bottom: 50 }, 10, 30000);
    assert.equal(layout.width, 120);
    assert.equal(layout.height, 70);
    assert.equal(layout.offsetX, -10);
    assert.equal(layout.offsetY, -10);
});

test("computeCompLayout: maxSizeでクランプされる", () => {
    const layout = Core.computeCompLayout({ left: 0, top: 0, right: 100000, bottom: 50 }, 0, 30000);
    assert.equal(layout.width, 30000);
});

test("computeCompLayout: 最小値1にクランプされる", () => {
    const layout = Core.computeCompLayout({ left: 0, top: 0, right: 0, bottom: 0 }, 0, 30000);
    assert.equal(layout.width, 1);
    assert.equal(layout.height, 1);
});

// ── uniqueIndexesDescending ─────────────────────────────────────────

test("uniqueIndexesDescending: 重複を除いてindex降順に並べる", () => {
    const items = [{ index: 5 }, { index: 5 }, { index: 3 }, { index: 8 }];
    assert.deepEqual(Core.uniqueIndexesDescending([0, 1, 2, 3], items), [8, 5, 3]);
});

// ── colorDistance / classifySample ──────────────────────────────────

test("colorDistance: 同じ色なら0", () => {
    assert.equal(Core.colorDistance([1, 1, 1], [1, 1, 1]), 0);
});

test("colorDistance: 最大チャンネル差を返す（チェビシェフ距離）", () => {
    assert.equal(Core.colorDistance([1, 0, 0], [0, 0, 0]), 1);
});

test("classifySample: アルファがしきい値以下なら背景(false)", () => {
    const isFg = Core.classifySample([1, 1, 1, 0.01], { useAlpha: true, bgColor: null, alphaThreshold: 0.04, colorTolerance: 0.1 });
    assert.equal(isFg, false);
});

test("classifySample: アルファモードでアルファがしきい値超なら前景(true)", () => {
    const isFg = Core.classifySample([1, 1, 1, 0.5], { useAlpha: true, bgColor: null, alphaThreshold: 0.04, colorTolerance: 0.1 });
    assert.equal(isFg, true);
});

test("classifySample: 色モードで背景色から十分離れていれば前景(true)", () => {
    const isFg = Core.classifySample([1, 0, 0, 1], { useAlpha: false, bgColor: [1, 1, 1], alphaThreshold: 0.04, colorTolerance: 0.1 });
    assert.equal(isFg, true);
});

test("classifySample: 色モードで背景色に近ければ背景(false)", () => {
    const isFg = Core.classifySample([0.95, 0.95, 0.95, 1], { useAlpha: false, bgColor: [1, 1, 1], alphaThreshold: 0.04, colorTolerance: 0.1 });
    assert.equal(isFg, false);
});

// ── blobsFromForegroundGrid ──────────────────────────────────────────

test("blobsFromForegroundGrid: 離れた2つのかたまりを別々のブロブとして検出する", () => {
    // 5x5グリッド、10pxセル。左上2x2と右下2x2が別々のブロブ。
    const cols = 5, rows = 5, step = 10;
    const fg = new Array(cols * rows).fill(false);
    function set(x, y) { fg[y * cols + x] = true; }
    [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([x, y]) => set(x, y));
    [[3, 2], [4, 2], [3, 3], [4, 3]].forEach(([x, y]) => set(x, y));

    const blobs = Core.blobsFromForegroundGrid(fg, cols, rows, { left: 0, top: 0, width: 50, height: 50 }, step);

    assert.equal(blobs.length, 2);
    const b1 = blobs.find(b => b.left === 0 && b.top === 0);
    assert.ok(b1, "blob1 not found");
    assert.deepEqual(b1, { left: 0, top: 0, right: 20, bottom: 20 });

    const b2 = blobs.find(b => b.left === 30);
    assert.ok(b2, "blob2 not found");
    assert.deepEqual(b2, { left: 30, top: 20, right: 50, bottom: 40 });
});

test("blobsFromForegroundGrid: 斜め(8近傍)に接するセルは同じブロブになる", () => {
    const cols = 2, rows = 2, step = 10;
    const fg = [true, false, false, true]; // (0,0)と(1,1)が斜めに接する
    const blobs = Core.blobsFromForegroundGrid(fg, cols, rows, { left: 0, top: 0, width: 20, height: 20 }, step);
    assert.equal(blobs.length, 1);
    assert.deepEqual(blobs[0], { left: 0, top: 0, right: 20, bottom: 20 });
});

test("blobsFromForegroundGrid: 逆方向の斜め接触も同じブロブになる", () => {
    const cols = 2, rows = 2, step = 10;
    const fg = [false, true, true, false]; // (1,0)と(0,1)が斜めに接する
    const blobs = Core.blobsFromForegroundGrid(fg, cols, rows, { left: 0, top: 0, width: 20, height: 20 }, step);
    assert.equal(blobs.length, 1);
});

// ── shiftVectorProp / shiftScalarProp ────────────────────────────────

test("shiftVectorProp: キーフレームなし(静的値)の場合、値を直接シフトする", () => {
    const prop = createMockValueProperty([100, 50, 0]);
    Core.shiftVectorProp(prop, 10, 5);
    assert.deepEqual(prop._dump(), [90, 45, 0]);
});

test("shiftVectorProp: キーフレームがある場合、全キーをシフトする", () => {
    const prop = createMockValueProperty([{ time: 0, value: [10, 10] }, { time: 1, value: [20, 20] }]);
    Core.shiftVectorProp(prop, 5, 5);
    assert.deepEqual(prop._dump(), [[5, 5], [15, 15]]);
});

test("shiftScalarProp: キーフレームなしの場合、値を直接シフトする", () => {
    const prop = createMockValueProperty(100);
    Core.shiftScalarProp(prop, 10);
    assert.equal(prop._dump(), 90);
});

test("shiftScalarProp: キーフレームがある場合、全キーをシフトする", () => {
    const prop = createMockValueProperty([{ time: 0, value: 5 }, { time: 1, value: 15 }]);
    Core.shiftScalarProp(prop, 2);
    assert.deepEqual(prop._dump(), [3, 13]);
});
