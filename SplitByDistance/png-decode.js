// png-decode.js
// 最小限の PNG デコーダー（Node.js専用。zlibはNode組み込みモジュールを使用）。
//
// サポート範囲（意図的に絞っている）：
//   ・ビット深度 8 のみ（16/4/2/1 は非対応でエラーにする）
//   ・カラータイプ 0(Grayscale) / 2(RGB) / 4(GrayscaleAlpha) / 6(RGBA) のみ
//     （3=パレット画像は非対応。RGB/RGBAで書き出し直してください）
//   ・非インターレース（Adam7インターレースは非対応）
// 対応範囲外のPNGを渡した場合は、サイレントに壊れた結果を返さず、
// 必ずエラーをthrowする（「なんとなく動くが結果が間違っている」状態を避けるため）。

"use strict";

const zlib = require("zlib");

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function paethPredictor(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
}

function readChunks(buf) {
    if (buf.length < 8 || !buf.slice(0, 8).equals(PNG_SIGNATURE)) {
        throw new Error("PNGシグネチャが見つかりません（PNGファイルではない可能性があります）");
    }
    const chunks = [];
    let pos = 8;
    while (pos < buf.length) {
        const length = buf.readUInt32BE(pos);
        const type = buf.toString("ascii", pos + 4, pos + 8);
        const dataStart = pos + 8;
        const data = buf.slice(dataStart, dataStart + length);
        chunks.push({ type: type, data: data });
        pos = dataStart + length + 4; // +4 = CRC
        if (type === "IEND") break;
    }
    return chunks;
}

// bytesPerPixel（バイト深度8前提）
function channelsForColorType(colorType) {
    switch (colorType) {
        case 0: return 1; // Grayscale
        case 2: return 3; // RGB
        case 4: return 2; // GrayscaleAlpha
        case 6: return 4; // RGBA
        default: return null; // 3(Palette)含め非対応
    }
}

// フィルタ解除後の生バイト列(各行 bpp*width バイト、フィルタバイトなし)を返す
function unfilter(raw, width, height, bpp) {
    const rowBytes = width * bpp;
    const out = Buffer.alloc(rowBytes * height);
    let rawPos = 0;

    for (let y = 0; y < height; y++) {
        const filterType = raw[rawPos]; rawPos++;
        const rowStart = y * rowBytes;
        const prevRowStart = (y - 1) * rowBytes;

        for (let i = 0; i < rowBytes; i++) {
            const x = raw[rawPos + i];
            const a = (i >= bpp) ? out[rowStart + i - bpp] : 0;
            const b = (y > 0) ? out[prevRowStart + i] : 0;
            const c = (y > 0 && i >= bpp) ? out[prevRowStart + i - bpp] : 0;

            let value;
            switch (filterType) {
                case 0: value = x; break;
                case 1: value = (x + a) & 0xFF; break;
                case 2: value = (x + b) & 0xFF; break;
                case 3: value = (x + Math.floor((a + b) / 2)) & 0xFF; break;
                case 4: value = (x + paethPredictor(a, b, c)) & 0xFF; break;
                default: throw new Error("未対応のPNGフィルタタイプ: " + filterType);
            }
            out[rowStart + i] = value;
        }
        rawPos += rowBytes;
    }
    return out;
}

// 戻り値: { width, height, pixels: Buffer(width*height*4, RGBA 0-255) }
function decodePng(buf) {
    const chunks = readChunks(buf);
    const ihdrChunk = chunks.find(c => c.type === "IHDR");
    if (!ihdrChunk) throw new Error("IHDRチャンクが見つかりません");

    const width = ihdrChunk.data.readUInt32BE(0);
    const height = ihdrChunk.data.readUInt32BE(4);
    const bitDepth = ihdrChunk.data.readUInt8(8);
    const colorType = ihdrChunk.data.readUInt8(9);
    const interlace = ihdrChunk.data.readUInt8(12);

    if (bitDepth !== 8) {
        throw new Error("ビット深度8以外のPNGは非対応です（bitDepth=" + bitDepth + "）。8bit PNGとして書き出し直してください。");
    }
    if (interlace !== 0) {
        throw new Error("インターレースPNGは非対応です。非インターレースで書き出し直してください。");
    }
    const channels = channelsForColorType(colorType);
    if (channels === null) {
        throw new Error("非対応のカラータイプです（colorType=" + colorType + "）。パレット(インデックス)PNGはRGBまたはRGBAで書き出し直してください。");
    }

    const idatData = Buffer.concat(chunks.filter(c => c.type === "IDAT").map(c => c.data));
    if (idatData.length === 0) throw new Error("IDATチャンクが見つかりません");

    const inflated = zlib.inflateSync(idatData);
    const bpp = channels; // bitDepth=8前提なので1チャンネル=1バイト
    const raw = unfilter(inflated, width, height, bpp);

    const pixels = Buffer.alloc(width * height * 4);
    for (let idx = 0; idx < width * height; idx++) {
        const srcOff = idx * channels;
        const dstOff = idx * 4;
        let r, g, b, a;
        if (channels === 4) {
            r = raw[srcOff]; g = raw[srcOff + 1]; b = raw[srcOff + 2]; a = raw[srcOff + 3];
        } else if (channels === 3) {
            r = raw[srcOff]; g = raw[srcOff + 1]; b = raw[srcOff + 2]; a = 255;
        } else if (channels === 2) {
            r = g = b = raw[srcOff]; a = raw[srcOff + 1];
        } else {
            r = g = b = raw[srcOff]; a = 255;
        }
        pixels[dstOff] = r; pixels[dstOff + 1] = g; pixels[dstOff + 2] = b; pixels[dstOff + 3] = a;
    }

    return { width: width, height: height, pixels: pixels };
}

module.exports = { decodePng: decodePng };
