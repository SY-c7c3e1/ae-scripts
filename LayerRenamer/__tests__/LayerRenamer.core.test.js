// LayerRenamer.core.test.js
// LayerRenamer.core.js のロジックを、AE本体を起動せずに検証するテスト。
// 実行: npm test （リポジトリ直下） または node --test このファイル

const assert = require("node:assert/strict");
const { test } = require("node:test");
const LayerRenamerCore = require("../LayerRenamer.core.js");

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

test("renameLayerName: オプション未指定なら元の名前のまま", () => {
    assert.equal(LayerRenamerCore.renameLayerName("Layer 01", opts()), "Layer 01");
});

test("renameLayerName: 先頭からN文字削除する", () => {
    assert.equal(LayerRenamerCore.renameLayerName("ABCDEF", opts({ firstDelNum: 2 })), "CDEF");
});

test("renameLayerName: 末尾からN文字削除する", () => {
    assert.equal(LayerRenamerCore.renameLayerName("ABCDEF", opts({ endDelNum: 2 })), "ABCD");
});

test("renameLayerName: 削除文字数が名前の長さ以上のときは削除しない（安全ガード）", () => {
    assert.equal(LayerRenamerCore.renameLayerName("ABC", opts({ firstDelNum: 3 })), "ABC");
    assert.equal(LayerRenamerCore.renameLayerName("ABC", opts({ firstDelNum: 10 })), "ABC");
    assert.equal(LayerRenamerCore.renameLayerName("ABC", opts({ endDelNum: 3 })), "ABC");
});

test("renameLayerName: 先頭・末尾を先に削除してから前後に文字を追加する", () => {
    // 削除後の長さで再判定されるため、削除→削除の組み合わせも安全に動く
    assert.equal(
        LayerRenamerCore.renameLayerName("ABCDE", opts({ firstDelNum: 2, endDelNum: 2, firstText: "[", endText: "]" })),
        "[C]"
    );
});

test("renameLayerName: 文字列を全置換する", () => {
    assert.equal(
        LayerRenamerCore.renameLayerName("comp_a_comp_b", opts({ beforeReplaceText: "comp", afterReplaceText: "layer" })),
        "layer_a_layer_b"
    );
});

test("renameLayerName: 置換前テキストの正規表現特殊文字はリテラルとして扱われる", () => {
    // "." は正規表現では任意の1文字にマッチするが、ここではリテラルの "." だけにマッチしてほしい
    assert.equal(
        LayerRenamerCore.renameLayerName("a.b axb", opts({ beforeReplaceText: "a.b", afterReplaceText: "X" })),
        "X axb"
    );
});

test("renameLayerName: 置換後テキストに $ が含まれても特殊パターンとして解釈されない", () => {
    // String#replace に文字列を渡すと "$&" 等が特殊な置換パターンとして解釈されてしまうが、
    // このツールでは常にリテラルな文字列として挿入されるべき。
    assert.equal(
        LayerRenamerCore.renameLayerName("price", opts({ beforeReplaceText: "price", afterReplaceText: "$100" })),
        "$100"
    );
    assert.equal(
        LayerRenamerCore.renameLayerName("aXb", opts({ beforeReplaceText: "X", afterReplaceText: "$&$&" })),
        "a$&$&b"
    );
});

test("renameLayerName: 先頭・末尾への追加は最後に行われる", () => {
    assert.equal(
        LayerRenamerCore.renameLayerName("core", opts({ firstText: "pre_", endText: "_post" })),
        "pre_core_post"
    );
});

test("renameLayerName: 削除・置換・前後追加をすべて組み合わせる", () => {
    assert.equal(
        LayerRenamerCore.renameLayerName(
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

test("escapeRegExp: 正規表現の特殊文字をすべてエスケープする", () => {
    const escaped = LayerRenamerCore.escapeRegExp("a.b*c?d");
    const re = new RegExp(escaped);
    assert.ok(re.test("a.b*c?d"));
    assert.ok(!re.test("axbYcZd"));
});
