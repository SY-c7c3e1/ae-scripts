// png-decode.test.js
// png-decode.js の正しさを検証するテスト。
// フィルタ解除ロジック(unfilter)を独立して検証するため、
// フィルタタイプ2(Up)を手計算したバイト列を直接PNGに埋め込むケースを含む。

const assert = require("node:assert/strict");
const { test } = require("node:test");
const zlib = require("node:zlib");
const { decodePng } = require("../png-decode.js");
const { buildPngFromRawScanlines, encodeRgbaPng, makeChunk, SIGNATURE } = require("./png-test-helper.js");

test("decodePng: RGBAの単色画像を正しくデコードできる（フィルタ0/None）", () => {
    const width = 2, height = 2;
    const pixels = Buffer.from([
        255, 0, 0, 255,   0, 255, 0, 128,
        0, 0, 255, 0,     255, 255, 255, 255
    ]);
    const png = encodeRgbaPng(width, height, pixels);
    const decoded = decodePng(png);

    assert.equal(decoded.width, width);
    assert.equal(decoded.height, height);
    assert.deepEqual(Array.from(decoded.pixels), Array.from(pixels));
});

test("decodePng: フィルタタイプ2(Up)を手計算したバイト列を正しく復元する", () => {
    // グレースケール(colorType=0), 幅1 x 高さ2。
    // row0: raw=100, 上の行なし(b=0) -> filtered = (100 - 0) & 0xFF = 100
    // row1: raw=150, 上=100         -> filtered = (150 - 100) & 0xFF = 50
    const rawScanlines = Buffer.from([
        2, 100,  // filterType=2(Up), value=100
        2, 50    // filterType=2(Up), value=50
    ]);
    const png = buildPngFromRawScanlines(1, 2, 0, rawScanlines);
    const decoded = decodePng(png);

    assert.equal(decoded.width, 1);
    assert.equal(decoded.height, 2);
    // グレースケールはRGBAに展開され、アルファは255固定
    assert.deepEqual(Array.from(decoded.pixels), [100, 100, 100, 255, 150, 150, 150, 255]);
});

test("decodePng: RGB(アルファなし)はアルファ255として展開される", () => {
    const width = 1, height = 1;
    const rawScanlines = Buffer.from([0, 10, 20, 30]); // filterType=0, R=10,G=20,B=30
    const png = buildPngFromRawScanlines(width, height, 2, rawScanlines);
    const decoded = decodePng(png);
    assert.deepEqual(Array.from(decoded.pixels), [10, 20, 30, 255]);
});

test("decodePng: GrayscaleAlphaを正しく展開する", () => {
    const width = 1, height = 1;
    const rawScanlines = Buffer.from([0, 200, 64]); // filterType=0, gray=200, alpha=64
    const png = buildPngFromRawScanlines(width, height, 4, rawScanlines);
    const decoded = decodePng(png);
    assert.deepEqual(Array.from(decoded.pixels), [200, 200, 200, 64]);
});

test("decodePng: ビット深度8以外はエラーになる", () => {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(1, 0);
    ihdr.writeUInt32BE(1, 4);
    ihdr.writeUInt8(16, 8); // bit depth 16
    ihdr.writeUInt8(6, 9);  // color type RGBA
    ihdr.writeUInt8(0, 10); ihdr.writeUInt8(0, 11); ihdr.writeUInt8(0, 12);

    const idat = zlib.deflateSync(Buffer.from([0, 0, 0, 0, 0]));
    const png = Buffer.concat([
        SIGNATURE,
        makeChunk("IHDR", ihdr),
        makeChunk("IDAT", idat),
        makeChunk("IEND", Buffer.alloc(0))
    ]);

    assert.throws(() => decodePng(png), /ビット深度8以外/);
});

test("decodePng: 実際に2つの離れた矩形を含む画像で、ピクセルが正しく読める", () => {
    const width = 10, height = 10;
    const pixels = Buffer.alloc(width * height * 4); // 全て透明(0,0,0,0)で初期化

    function setOpaque(x, y, r, g, b) {
        const off = (y * width + x) * 4;
        pixels[off] = r; pixels[off + 1] = g; pixels[off + 2] = b; pixels[off + 3] = 255;
    }
    // 左上に2x2の赤いブロック
    setOpaque(0, 0, 255, 0, 0); setOpaque(1, 0, 255, 0, 0);
    setOpaque(0, 1, 255, 0, 0); setOpaque(1, 1, 255, 0, 0);
    // 右下に2x2の青いブロック
    setOpaque(8, 8, 0, 0, 255); setOpaque(9, 8, 0, 0, 255);
    setOpaque(8, 9, 0, 0, 255); setOpaque(9, 9, 0, 0, 255);

    const png = encodeRgbaPng(width, height, pixels);
    const decoded = decodePng(png);

    function getPixel(x, y) {
        const off = (y * width + x) * 4;
        return [decoded.pixels[off], decoded.pixels[off + 1], decoded.pixels[off + 2], decoded.pixels[off + 3]];
    }
    assert.deepEqual(getPixel(0, 0), [255, 0, 0, 255]);
    assert.deepEqual(getPixel(9, 9), [0, 0, 255, 255]);
    assert.deepEqual(getPixel(5, 5), [0, 0, 0, 0]); // 中央は透明のまま
});
