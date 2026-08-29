// detect-objects.cli.test.js
// detect-objects.js を実際に子プロセスとして起動し、PNGファイル入力 → JSON出力までの
// 一連の流れ（AEのjsxが system.callSystem() 経由で行うのと同じ流れ）を検証する。

const assert = require("node:assert/strict");
const { test } = require("node:test");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const { encodeRgbaPng } = require("./png-test-helper.js");

const CLI_PATH = path.join(__dirname, "..", "detect-objects.js");

function tempFile(name) {
    return path.join(os.tmpdir(), "ae-scripts-test-" + process.pid + "-" + name);
}

test("detect-objects.js CLI: PNGファイルから検出し、JSONを書き出す", () => {
    const width = 12, height = 12;
    const pixels = Buffer.alloc(width * height * 4);
    function fillRect(x0, y0, x1, y1, r, g, b, a) {
        for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
                const off = (y * width + x) * 4;
                pixels[off] = r; pixels[off + 1] = g; pixels[off + 2] = b; pixels[off + 3] = a;
            }
        }
    }
    fillRect(1, 1, 4, 4, 255, 0, 0, 255);
    fillRect(8, 8, 11, 11, 0, 0, 255, 255);

    const png = encodeRgbaPng(width, height, pixels);
    const inputPath = tempFile("input.png");
    const outputPath = tempFile("output.json");
    fs.writeFileSync(inputPath, png);

    try {
        const stdout = execFileSync(process.execPath, [CLI_PATH, inputPath, outputPath, "--bg=auto"], { encoding: "utf8" });
        assert.match(stdout, /OK: 2 objects detected/);

        const result = JSON.parse(fs.readFileSync(outputPath, "utf8"));
        assert.equal(result.width, width);
        assert.equal(result.height, height);
        assert.equal(result.blobs.length, 2);
    } finally {
        try { fs.unlinkSync(inputPath); } catch (e) {}
        try { fs.unlinkSync(outputPath); } catch (e) {}
    }
});

test("detect-objects.js CLI: 不正な入力ファイルはエラー終了し、標準エラーにメッセージを出す", () => {
    const inputPath = tempFile("not-a-png.png");
    const outputPath = tempFile("output2.json");
    fs.writeFileSync(inputPath, Buffer.from("this is not a png"));

    try {
        execFileSync(process.execPath, [CLI_PATH, inputPath, outputPath], { encoding: "utf8" });
        assert.fail("エラー終了するはずだった");
    } catch (e) {
        assert.equal(e.status, 2);
        assert.match(e.stderr, /ERROR:/);
    } finally {
        try { fs.unlinkSync(inputPath); } catch (e) {}
    }
});
