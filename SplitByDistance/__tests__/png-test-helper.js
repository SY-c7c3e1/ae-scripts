// png-test-helper.js
// テスト専用のPNG生成ヘルパー（png-decode.js の検証用）。
// 本体の実行には一切使わない、テストフィクスチャ作成用のコード。

"use strict";

const zlib = require("zlib");

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(buf) {
    if (!crc32.table) {
        const table = [];
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) {
                c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            }
            table[n] = c >>> 0;
        }
        crc32.table = table;
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
        crc = crc32.table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeChunk(type, data) {
    const typeBuf = Buffer.from(type, "ascii");
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

// rawIdat: フィルタバイト込みの生スキャンラインデータ（未圧縮）をそのまま渡す。
// テストで「特定のフィルタタイプで手動計算したバイト列」を直接検証したい場合に使う。
function buildPngFromRawScanlines(width, height, colorType, rawScanlines) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr.writeUInt8(8, 8);         // bit depth
    ihdr.writeUInt8(colorType, 9);
    ihdr.writeUInt8(0, 10);        // compression method
    ihdr.writeUInt8(0, 11);        // filter method
    ihdr.writeUInt8(0, 12);        // interlace method (0 = none)

    const idatData = zlib.deflateSync(rawScanlines);

    return Buffer.concat([
        SIGNATURE,
        makeChunk("IHDR", ihdr),
        makeChunk("IDAT", idatData),
        makeChunk("IEND", Buffer.alloc(0))
    ]);
}

// pixels: Buffer(width*height*4) の RGBA。常にフィルタタイプ0(None)で書き出す。
function encodeRgbaPng(width, height, pixels) {
    const rowBytes = width * 4;
    const raw = Buffer.alloc((rowBytes + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (rowBytes + 1)] = 0; // filter type: None
        pixels.copy(raw, y * (rowBytes + 1) + 1, y * rowBytes, y * rowBytes + rowBytes);
    }
    return buildPngFromRawScanlines(width, height, 6, raw);
}

module.exports = {
    buildPngFromRawScanlines: buildPngFromRawScanlines,
    encodeRgbaPng: encodeRgbaPng,
    makeChunk: makeChunk,
    SIGNATURE: SIGNATURE
};
