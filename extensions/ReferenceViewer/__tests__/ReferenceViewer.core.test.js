const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../client/ReferenceViewer.core.js");

test("parseData: 空・壊れたデータは空データになる", () => {
    assert.deepEqual(Core.parseData(""), Core.createEmptyData());
    assert.deepEqual(Core.parseData("{broken"), Core.createEmptyData());
    assert.deepEqual(Core.parseData("null"), Core.createEmptyData());
});

test("parseData / serializeData: 往復で内容が保たれる", () => {
    const d = Core.createEmptyData();
    Core.addFiles(d, ["C:/refs/kv.jpg"], "C:/proj");
    Core.addLink(d, "公式", "example.com");
    d.memo = "歌詞メモ\n2行目 \"引用\"";
    const back = Core.parseData(Core.serializeData(d));
    assert.deepEqual(back, d);
});

test("parseData: 不正なアイテムは捨てる", () => {
    const d = Core.parseData(JSON.stringify({
        items: [{ type: "file" }, { type: "link", url: "" }, { type: "x" }, null,
                { type: "file", path: "C:/a/b.png" }],
        memo: 123
    }));
    assert.equal(d.items.length, 1);
    assert.equal(d.items[0].name, "b.png");
    assert.equal(d.memo, "");
});

test("relativePath: 同じドライブなら相対パス、別ドライブなら空", () => {
    assert.equal(Core.relativePath("C:\\proj\\aep", "C:\\proj\\ref\\a.jpg"), "../ref/a.jpg");
    assert.equal(Core.relativePath("C:/proj", "C:/proj/_ref/a.jpg"), "_ref/a.jpg");
    assert.equal(Core.relativePath("c:/Proj", "C:/proj/a.jpg"), "a.jpg"); // Windowsは大小無視
    assert.equal(Core.relativePath("C:/proj", "D:/a.jpg"), "");
    assert.equal(Core.relativePath("/Users/y/proj", "/Users/y/ref/a.jpg"), "../ref/a.jpg");
    assert.equal(Core.relativePath("", "C:/a.jpg"), "");
});

test("joinPath: 相対パスを戻せる", () => {
    assert.equal(Core.joinPath("D:/new/aep", "../ref/a.jpg"), "D:/new/ref/a.jpg");
    assert.equal(Core.joinPath("/Users/y/proj", "./a/b.png"), "/Users/y/proj/a/b.png");
});

test("fileKind / isAeImportable", () => {
    assert.equal(Core.fileKind("a.JPG"), "image");
    assert.equal(Core.fileKind("a.pdf"), "pdf");
    assert.equal(Core.fileKind("lyrics.txt"), "text");
    assert.equal(Core.fileKind("a.docx"), "other");
    assert.equal(Core.fileKind("noext"), "other");
    assert.equal(Core.isAeImportable("a.psd"), true);
    assert.equal(Core.isAeImportable("a.docx"), false);
});

test("addFiles: 重複は追加しない・相対パスを記録", () => {
    const d = Core.createEmptyData();
    const a1 = Core.addFiles(d, ["C:\\proj\\ref\\a.jpg", "C:/proj/ref/b.pdf"], "C:/proj/aep");
    assert.equal(a1.length, 2);
    assert.equal(a1[0].path, "C:/proj/ref/a.jpg");
    assert.equal(a1[0].relPath, "../ref/a.jpg");
    const a2 = Core.addFiles(d, ["c:/PROJ/ref/A.jpg", "C:/proj/ref/c.png"], "");
    assert.equal(a2.length, 1);
    assert.equal(a2[0].relPath, "");
    assert.equal(d.items.length, 3);
});

test("addLink: スキームを補い、名前が空ならURLを名前に", () => {
    const d = Core.createEmptyData();
    assert.equal(Core.addLink(d, "", "  example.com/x ").url, "https://example.com/x");
    assert.equal(d.items[0].name, "https://example.com/x");
    assert.equal(Core.addLink(d, "A", "http://a.jp").url, "http://a.jp");
    assert.equal(Core.addLink(d, "B", "   "), null);
    assert.equal(d.items.length, 2);
});

test("rename / remove / move", () => {
    const d = Core.createEmptyData();
    const [a, b, c] = Core.addFiles(d, ["C:/a.jpg", "C:/b.jpg", "C:/c.jpg"], "");
    assert.equal(Core.renameItem(d, b.id, "  B画像 "), true);
    assert.equal(d.items[1].name, "B画像");
    assert.equal(Core.renameItem(d, b.id, "  "), false);

    assert.equal(Core.moveItem(d, a.id, 2), true);
    assert.deepEqual(d.items.map(i => i.id), [b.id, c.id, a.id]);
    assert.equal(Core.moveItem(d, a.id, 99), false); // 既に末尾
    Core.moveItem(d, a.id, -5);
    assert.deepEqual(d.items.map(i => i.id), [a.id, b.id, c.id]);

    assert.equal(Core.removeItem(d, b.id), true);
    assert.equal(Core.removeItem(d, "nope"), false);
    assert.deepEqual(d.items.map(i => i.id), [a.id, c.id]);
});

test("resolveCandidates: 絶対パス→相対パスの順", () => {
    const item = { type: "file", path: "C:/old/ref/a.jpg", relPath: "../ref/a.jpg" };
    assert.deepEqual(Core.resolveCandidates(item, "E:/collected/aep"),
        ["C:/old/ref/a.jpg", "E:/collected/ref/a.jpg"]);
    assert.deepEqual(Core.resolveCandidates(item, ""), ["C:/old/ref/a.jpg"]);
});
