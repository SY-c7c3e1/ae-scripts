// Renamer.core.test.js
// Renamer.core.js のロジックを、AE本体を起動せずに検証するテスト。
// レイヤー名・Projectアイテム名のどちらに使っても同じロジックなので、
// ここでは単に「名前の文字列」として検証する。
// 実行: npm test （リポジトリ直下） または node --test このファイル

const assert = require("node:assert/strict");
const { test } = require("node:test");
const RenamerCore = require("../Renamer.core.js");

function opts(overrides) {
    return Object.assign({
        beforeReplaceText: "",
        afterReplaceText:  "",
        firstText:         "",
        endText:           "",
        firstDelNum:       0,
        endDelNum:         0
    }, overrides || {});
}

test("computeNewName: オプション未指定なら元の名前のまま", () => {
    assert.equal(RenamerCore.computeNewName("Layer 01", opts()), "Layer 01");
});

test("computeNewName: 先頭からN文字削除する", () => {
    assert.equal(RenamerCore.computeNewName("ABCDEF", opts({ firstDelNum: 2 })), "CDEF");
});

test("computeNewName: 末尾からN文字削除する", () => {
    assert.equal(RenamerCore.computeNewName("ABCDEF", opts({ endDelNum: 2 })), "ABCD");
});

test("computeNewName: 削除文字数が名前の長さ以上のときは削除しない（安全ガード）", () => {
    assert.equal(RenamerCore.computeNewName("ABC", opts({ firstDelNum: 3 })), "ABC");
    assert.equal(RenamerCore.computeNewName("ABC", opts({ firstDelNum: 10 })), "ABC");
    assert.equal(RenamerCore.computeNewName("ABC", opts({ endDelNum: 3 })), "ABC");
});

test("computeNewName: 先頭・末尾を先に削除してから前後に文字を追加する", () => {
    // 削除後の長さで再判定されるため、削除→削除の組み合わせも安全に動く
    assert.equal(
        RenamerCore.computeNewName("ABCDE", opts({ firstDelNum: 2, endDelNum: 2, firstText: "[", endText: "]" })),
        "[C]"
    );
});

test("computeNewName: 文字列を全置換する", () => {
    assert.equal(
        RenamerCore.computeNewName("comp_a_comp_b", opts({ beforeReplaceText: "comp", afterReplaceText: "layer" })),
        "layer_a_layer_b"
    );
});

test("computeNewName: 置換前テキストの正規表現特殊文字はリテラルとして扱われる", () => {
    // "." は正規表現では任意の1文字にマッチするが、ここではリテラルの "." だけにマッチしてほしい
    assert.equal(
        RenamerCore.computeNewName("a.b axb", opts({ beforeReplaceText: "a.b", afterReplaceText: "X" })),
        "X axb"
    );
});

test("computeNewName: 置換後テキストに $ が含まれても特殊パターンとして解釈されない", () => {
    // String#replace に文字列を渡すと "$&" 等が特殊な置換パターンとして解釈されてしまうが、
    // このツールでは常にリテラルな文字列として挿入されるべき。
    assert.equal(
        RenamerCore.computeNewName("price", opts({ beforeReplaceText: "price", afterReplaceText: "$100" })),
        "$100"
    );
    assert.equal(
        RenamerCore.computeNewName("aXb", opts({ beforeReplaceText: "X", afterReplaceText: "$&$&" })),
        "a$&$&b"
    );
});

test("computeNewName: 先頭・末尾への追加は最後に行われる", () => {
    assert.equal(
        RenamerCore.computeNewName("core", opts({ firstText: "pre_", endText: "_post" })),
        "pre_core_post"
    );
});

test("computeNewName: 削除・置換・前後追加をすべて組み合わせる", () => {
    assert.equal(
        RenamerCore.computeNewName(
            "01_comp_footage_v1",
            opts({
                firstDelNum: 3,        // "comp_footage_v1"
                endDelNum: 3,           // "comp_footage"
                beforeReplaceText: "comp",
                afterReplaceText: "layer",
                firstText: "[",
                endText: "]"
            })
        ),
        "[layer_footage]"
    );
});

test("computeNewName: Projectアイテム名（フッテージ拡張子つき）にも同じロジックが使える", () => {
    // ItemRenamer由来のユースケース：拡張子付きファイル名の一括整形
    assert.equal(
        RenamerCore.computeNewName("footage_v1.mp4", opts({ beforeReplaceText: "footage", afterReplaceText: "shot" })),
        "shot_v1.mp4"
    );
});

test("escapeRegExp: 正規表現の特殊文字をすべてエスケープする", () => {
    const escaped = RenamerCore.escapeRegExp("a.b*c?d");
    const re = new RegExp(escaped);
    assert.ok(re.test("a.b*c?d"));
    assert.ok(!re.test("axbYcZd"));
});
