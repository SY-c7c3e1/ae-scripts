// detect-objects.js
// 1枚のPNG画像から、離れたオブジェクト（連結成分）を検出してJSONで出力するNode.js CLI。
// SplitByDistance.jsx から system.callSystem() 経由で呼び出される。
//
// 使い方:
//   node detect-objects.js <入力PNG> <出力JSON> [--bg=auto|alpha|white|black] [--minArea=px2]
//
// 出力JSON: { width, height, bgMode, useAlpha, bgColor, blobs: [{left,top,right,bottom}, ...] }
// blobs の座標は画像のピクセル座標系（左上が原点）。

"use strict";

const fs = require("fs");
const { decodePng } = require("./png-decode.js");
const Core = require("./SplitByDistance.core.js");

// pixels: Buffer(width*height*4, RGBA 0-255)
// opts: { bgMode: "auto"|"alpha"|"white"|"black", minArea: number(px^2),
//         alphaThreshold: 0-1, colorTolerance: 0-1 }
function detectObjectsInImage(width, height, pixels, opts) {
    opts = opts || {};
    const bgMode = opts.bgMode || "auto";
    const minArea = opts.minArea || 0;
    const alphaThreshold = (opts.alphaThreshold !== undefined) ? opts.alphaThreshold : (10 / 255);
    const colorTolerance = (opts.colorTolerance !== undefined) ? opts.colorTolerance : (30 / 255);

    function sampleAt(x, y) {
        const off = (y * width + x) * 4;
        return [pixels[off] / 255, pixels[off + 1] / 255, pixels[off + 2] / 255, pixels[off + 3] / 255];
    }

    let useAlpha = (bgMode === "alpha");
    let bgColor = null;
    if (bgMode === "white") bgColor = [1, 1, 1];
    else if (bgMode === "black") bgColor = [0, 0, 0];

    if (bgMode === "auto" || bgMode === "white" || bgMode === "black") {
        const inset = Math.max(1, Math.floor(Math.min(width, height) * 0.02));
        const corners = [
            [inset, inset], [width - 1 - inset, inset],
            [inset, height - 1 - inset], [width - 1 - inset, height - 1 - inset]
        ];
        let sumR = 0, sumG = 0, sumB = 0, sumA = 0;
        for (let ci = 0; ci < corners.length; ci++) {
            const cx = Math.max(0, Math.min(width - 1, corners[ci][0]));
            const cy = Math.max(0, Math.min(height - 1, corners[ci][1]));
            const s = sampleAt(cx, cy);
            sumR += s[0]; sumG += s[1]; sumB += s[2]; sumA += s[3];
        }
        const cornerAlpha = sumA / corners.length;
        const cornerColor = [sumR / corners.length, sumG / corners.length, sumB / corners.length];
        if (bgMode === "auto") {
            useAlpha = cornerAlpha < 0.5;
            if (!useAlpha) bgColor = cornerColor;
        } else if (cornerAlpha < 0.5) {
            // white/black指定でも、実際には透明な背景ならアルファ判定を優先する
            useAlpha = true;
        }
    }

    const classifyOpts = { useAlpha: useAlpha, bgColor: bgColor, alphaThreshold: alphaThreshold, colorTolerance: colorTolerance };

    const fg = new Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            fg[y * width + x] = Core.classifySample(sampleAt(x, y), classifyOpts);
        }
    }

    let blobs = Core.blobsFromForegroundGrid(fg, width, height, { left: 0, top: 0, width: width, height: height }, 1);

    if (minArea > 0) {
        blobs = blobs.filter(function (b) {
            return (b.right - b.left) * (b.bottom - b.top) >= minArea;
        });
    }

    return { blobs: blobs, useAlpha: useAlpha, bgColor: bgColor };
}

function parseArgs(argv) {
    const opts = { bgMode: "auto", minArea: 0 };
    const positional = [];
    for (let i = 0; i < argv.length; i++) {
        let m;
        if ((m = argv[i].match(/^--bg=(.+)$/))) opts.bgMode = m[1];
        else if ((m = argv[i].match(/^--minArea=([\d.]+)$/))) opts.minArea = parseFloat(m[1]);
        else positional.push(argv[i]);
    }
    opts.inputPath = positional[0];
    opts.outputPath = positional[1];
    return opts;
}

function main() {
    const opts = parseArgs(process.argv.slice(2));
    if (!opts.inputPath || !opts.outputPath) {
        console.error("使い方: node detect-objects.js <入力PNG> <出力JSON> [--bg=auto|alpha|white|black] [--minArea=px2]");
        process.exit(1);
        return;
    }

    try {
        const buf = fs.readFileSync(opts.inputPath);
        const img = decodePng(buf);
        const result = detectObjectsInImage(img.width, img.height, img.pixels, opts);
        const out = {
            width: img.width,
            height: img.height,
            bgMode: opts.bgMode,
            useAlpha: result.useAlpha,
            bgColor: result.bgColor,
            blobs: result.blobs
        };
        fs.writeFileSync(opts.outputPath, JSON.stringify(out));
        console.log("OK: " + result.blobs.length + " objects detected");
        process.exit(0);
    } catch (e) {
        console.error("ERROR: " + (e && e.message ? e.message : String(e)));
        process.exit(2);
    }
}

if (require.main === module) {
    main();
}

module.exports = { detectObjectsInImage: detectObjectsInImage, parseArgs: parseArgs };
