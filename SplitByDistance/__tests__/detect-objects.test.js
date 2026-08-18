// detect-objects.test.js
// detectObjectsInImage() のロジックを検証するテスト（PNG I/Oは介さず、
// ピクセルバッファを直接渡す。PNGデコード自体は png-decode.test.js で検証済み）。

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { detectObjectsInImage, parseArgs } = require("../detect-objects.js");

function makeTransparentCanvas(width, height) {
    return Buffer.alloc(width * height * 4); // 全て(0,0,0,0)
}

function fillRect(pixels, width, x0, y0, x1, y1, r, g, b, a) {
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            const off = (y * width + x) * 4;
            pixels[off] = r; pixels[off + 1] = g; pixels[off + 2] = b; pixels[off + 3] = a;
        }
    }
}

test("detectObjectsInImage: 透明背景+アルファ自動判定で、2つの離れた矩形を検出する", () => {
    const width = 20, height = 20;
    const pixels = makeTransparentCanvas(width, height);
    // 背景の自動判定は四隅付近をサンプリングするため、矩形はコーナーの
    // サンプル点(1,1)/(18,1)/(1,18)/(18,18)に重ならない位置に置く
    fillRect(pixels, width, 3, 3, 6, 6, 255, 0, 0, 255);       // 3x3 の赤
    fillRect(pixels, width, 12, 12, 16, 16, 0, 0, 255, 255);   // 4x4 の青

    const result = detectObjectsInImage(width, height, pixels, { bgMode: "auto" });

    assert.equal(result.useAlpha, true);
    assert.equal(result.blobs.length, 2);
    const areas = result.blobs.map(b => (b.right - b.left) * (b.bottom - b.top)).sort((a, b) => a - b);
    assert.deepEqual(areas, [9, 16]);
});

test("detectObjectsInImage: 白背景の画像を色ベースで検出する", () => {
    const width = 20, height = 20;
    const pixels = Buffer.alloc(width * height * 4);
    fillRect(pixels, width, 0, 0, width, height, 255, 255, 255, 255); // 全体を白で塗る
    fillRect(pixels, width, 2, 2, 6, 6, 0, 0, 0, 255);       // 黒い矩形
    fillRect(pixels, width, 12, 12, 18, 18, 200, 30, 30, 255); // 赤い矩形

    const result = detectObjectsInImage(width, height, pixels, { bgMode: "auto" });

    assert.equal(result.useAlpha, false);
    assert.equal(result.blobs.length, 2);
});

test("detectObjectsInImage: 明示的に white 指定でも動作する", () => {
    const width = 10, height = 10;
    const pixels = Buffer.alloc(width * height * 4);
    fillRect(pixels, width, 0, 0, width, height, 255, 255, 255, 255);
    fillRect(pixels, width, 3, 3, 7, 7, 10, 20, 30, 255);

    const result = detectObjectsInImage(width, height, pixels, { bgMode: "white" });
    assert.equal(result.blobs.length, 1);
    assert.deepEqual(result.blobs[0], { left: 3, top: 3, right: 7, bottom: 7 });
});

test("detectObjectsInImage: minArea未満の小さな検出はフィルタされる", () => {
    const width = 20, height = 20;
    const pixels = makeTransparentCanvas(width, height);
    fillRect(pixels, width, 5, 5, 6, 6, 255, 0, 0, 255);   // 1x1 = ノイズ想定
    fillRect(pixels, width, 10, 10, 15, 15, 0, 255, 0, 255); // 5x5 = 本命

    const withoutFilter = detectObjectsInImage(width, height, pixels, { bgMode: "auto" });
    assert.equal(withoutFilter.blobs.length, 2);

    const withFilter = detectObjectsInImage(width, height, pixels, { bgMode: "auto", minArea: 4 });
    assert.equal(withFilter.blobs.length, 1);
    assert.deepEqual(withFilter.blobs[0], { left: 10, top: 10, right: 15, bottom: 15 });
});

test("detectObjectsInImage: 検出0件でも例外を投げずに空配列を返す", () => {
    const width = 10, height = 10;
    const pixels = makeTransparentCanvas(width, height);
    const result = detectObjectsInImage(width, height, pixels, { bgMode: "auto" });
    assert.deepEqual(result.blobs, []);
});

test("parseArgs: 位置引数とオプションを分離できる", () => {
    const opts = parseArgs(["in.png", "out.json", "--bg=white", "--minArea=16"]);
    assert.equal(opts.inputPath, "in.png");
    assert.equal(opts.outputPath, "out.json");
    assert.equal(opts.bgMode, "white");
    assert.equal(opts.minArea, 16);
});

test("parseArgs: オプション省略時はデフォルト値になる", () => {
    const opts = parseArgs(["in.png", "out.json"]);
    assert.equal(opts.bgMode, "auto");
    assert.equal(opts.minArea, 0);
});
