// BlRenderImport.core.js のテスト（node --test）
const test = require("node:test");
const assert = require("node:assert");
const C = require("../BlRenderImport.core.js");

// 仮想のフォルダ: { "名前": { ...中身 } | null(=ファイル) }
function tree(obj) { return { name: "", children: obj }; }
function listDir(node) {
    return Object.keys(node.children).map((n) => {
        const v = node.children[n];
        return v && typeof v === "object" ? { name: n, isFolder: true, ref: { name: n, children: v } } : { name: n, isFolder: false, ref: n };
    });
}
function files(prefix, nums, ext, pad = 4) {
    const o = {};
    for (const n of nums) o[prefix + String(n).padStart(pad, "0") + "." + ext] = null;
    return o;
}

test("parseName: 連番の名前を分解する", () => {
    assert.deepStrictEqual(C.parseName("NUZ_01_SEM_0001.png"), { prefix: "NUZ_01_SEM_", num: 1, digits: 4, ext: "png" });
    assert.deepStrictEqual(C.parseName("shot.0120.EXR"), { prefix: "shot.", num: 120, digits: 4, ext: "exr" });
    assert.strictEqual(C.parseName("thumb.png"), null);
    assert.strictEqual(C.parseName("notes_01.txt"), null);
});

test("C7 Render Queue の出力: コレクションごとのフォルダ", () => {
    const root = tree({
        NUZ_01_SEM: files("NUZ_01_SEM_", [1, 2, 3, 4, 5, 6], "png"),
        NUZ_01_SEM_Beit: Object.assign(files("NUZ_01_SEM_Beit_", [1, 2, 4, 5], "png"), { "NUZ_01_SEM_Beit_0003.png.c7part": null }),
        ".c7lock": { "x_0001.png.lock": null, "x_0001.png": null },
        "背景 奥": files("背景 奥_", [101, 102, 103], "exr"),
    });
    const s = C.findSequences(root, listDir);
    assert.deepStrictEqual(s.map(C.label), [
        "NUZ_01_SEM/NUZ_01_SEM_[1-6].png",
        "NUZ_01_SEM_Beit/NUZ_01_SEM_Beit_[1-5].png",
        "背景 奥/背景 奥_[101-103].exr",
    ]);
    assert.strictEqual(s[1].gaps, 1, "抜けフレームを数える");
    assert.strictEqual(s[1].count, 4);
    assert.strictEqual(s[0].firstName, "NUZ_01_SEM_0001.png", "先頭のファイルで読み込む");
});

test("同じフォルダに別の連番が混ざっていても分ける", () => {
    const root = tree(Object.assign({}, files("A_", [1, 2], "png"), files("A_", [1, 2], "jpg"), files("B_", [10, 11], "png"),
        { "single_0007.png": null, "readme.txt": null, ".hidden_0001.png": null }));
    const s = C.findSequences(root, listDir);
    assert.deepStrictEqual(s.map(C.label), ["A_[1-2].jpg", "A_[1-2].png", "B_[10-11].png", "single_0007.png".replace("0007", "7")]);
    assert.strictEqual(s[3].count, 1);
});

test("桁数が違うものは別の連番", () => {
    const root = tree(Object.assign({}, files("c_", [1, 2], "png", 3), files("c_", [1, 2], "png", 4)));
    assert.strictEqual(C.findSequences(root, listDir).length, 2);
});

test("深さの上限", () => {
    const root = tree({ a: { b: { c: files("deep_", [1, 2], "png") } } });
    assert.strictEqual(C.findSequences(root, listDir).length, 1);
    assert.strictEqual(C.findSequences(root, listDir, 2).length, 0);
});

test("sameSequence: 読み込み済みの判定", () => {
    const seq = { prefix: "NUZ_01_SEM_", ext: "png", count: 6 };
    const dir = C.normalizePath("C:\\共有\\prj\\render\\NUZ_01_SEM\\");
    assert.ok(C.sameSequence(seq, dir, { dir: C.normalizePath("c:/共有/prj/render/NUZ_01_SEM"), fileName: "NUZ_01_SEM_0001.png", isStill: false }));
    assert.ok(!C.sameSequence(seq, dir, { dir, fileName: "NUZ_01_SEM_Beit_0001.png", isStill: false }), "名前が違う");
    assert.ok(!C.sameSequence(seq, dir, { dir: "c:/other", fileName: "NUZ_01_SEM_0001.png", isStill: false }), "フォルダが違う");
    assert.ok(!C.sameSequence(seq, dir, { dir, fileName: "NUZ_01_SEM_0001.png", isStill: true }), "1枚の静止画として読んだものは別");
});

test("アルファ: EXR だけプリマルチプライド", () => {
    assert.ok(C.isPremultiplied("exr"));
    assert.ok(C.isPremultiplied("EXR"));
    assert.ok(!C.isPremultiplied("png"));
});

test("結果メッセージ", () => {
    const m = C.summary("Bl-render", ["a"], [], ["x: err"], ["b（1フレーム抜け）"]);
    assert.match(m, /新しく読み込み: 1件/);
    assert.match(m, /読み込めなかった: 1件/);
    assert.match(m, /フレームが抜けている連番/);
});
