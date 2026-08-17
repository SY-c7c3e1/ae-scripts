// CompSettingsChanger.core.test.js
// CompSettingsChanger.core.js のロジックを、AE本体を起動せずに検証するテスト。
// 実行: npm test （リポジトリ直下） または node --test このファイル

const assert = require("node:assert/strict");
const { test } = require("node:test");
const Core = require("../CompSettingsChanger.core.js");

// ── parseRatio ──────────────────────────────────────────────

test("parseRatio: \"16:9\" 形式を数値に変換する", () => {
    assert.equal(Core.parseRatio("16:9"), 16 / 9);
});

test("parseRatio: \"16/9\" \"16x9\" 形式にも対応する", () => {
    assert.equal(Core.parseRatio("16/9"), 16 / 9);
    assert.equal(Core.parseRatio("16x9"), 16 / 9);
});

test("parseRatio: 小数の直接指定にも対応する", () => {
    assert.equal(Core.parseRatio("1.778"), 1.778);
});

test("parseRatio: 空文字はnull", () => {
    assert.equal(Core.parseRatio(""), null);
});

test("parseRatio: 分母0や不正な文字列はNaN", () => {
    assert.ok(isNaN(Core.parseRatio("16:0")));
    assert.ok(isNaN(Core.parseRatio("abc")));
});

// ── resolveFrameRateSelection ───────────────────────────────

test("resolveFrameRateSelection: \"none\" は変更なし", () => {
    const r = Core.resolveFrameRateSelection("none");
    assert.equal(r.frameRate, null);
    assert.equal(r.error, null);
});

test("resolveFrameRateSelection: 29.97 Non-Drop / Drop", () => {
    const ndf = Core.resolveFrameRateSelection("2997ndf");
    assert.equal(ndf.frameRate, 29.97);
    assert.equal(ndf.dropFrame, false);

    const df = Core.resolveFrameRateSelection("2997df");
    assert.equal(df.frameRate, 29.97);
    assert.equal(df.dropFrame, true);
});

test("resolveFrameRateSelection: 59.94 Non-Drop / Drop", () => {
    const ndf = Core.resolveFrameRateSelection("5994ndf");
    assert.equal(ndf.frameRate, 59.94);
    assert.equal(ndf.dropFrame, false);

    const df = Core.resolveFrameRateSelection("5994df");
    assert.equal(df.frameRate, 59.94);
    assert.equal(df.dropFrame, true);
});

test("resolveFrameRateSelection: 30 / 60 はDrop Frame扱いにならない", () => {
    assert.equal(Core.resolveFrameRateSelection("30").dropFrame, false);
    assert.equal(Core.resolveFrameRateSelection("60").frameRate, 60);
});

test("resolveFrameRateSelection: カスタム値（正常）", () => {
    const r = Core.resolveFrameRateSelection("custom", "24");
    assert.equal(r.frameRate, 24);
    assert.equal(r.error, null);
});

test("resolveFrameRateSelection: カスタム値が数値でない／範囲外はエラー", () => {
    assert.ok(Core.resolveFrameRateSelection("custom", "abc").error);
    assert.ok(Core.resolveFrameRateSelection("custom", "0").error);
    assert.ok(Core.resolveFrameRateSelection("custom", "100").error);
});

// ── computeDimensions ───────────────────────────────────────

const CURRENT = { width: 1000, height: 500 };

test("computeDimensions: 何も指定しなければ変更なし", () => {
    const r = Core.computeDimensions(CURRENT, {});
    assert.equal(r.width, 1000);
    assert.equal(r.height, 500);
    assert.equal(r.error, null);
});

test("computeDimensions: Widthのみ指定 → Heightは変更しない", () => {
    const r = Core.computeDimensions(CURRENT, { widthText: "800" });
    assert.equal(r.width, 800);
    assert.equal(r.height, 500);
});

test("computeDimensions: Heightのみ指定 → Widthは変更しない", () => {
    const r = Core.computeDimensions(CURRENT, { heightText: "400" });
    assert.equal(r.width, 1000);
    assert.equal(r.height, 400);
});

test("computeDimensions: Width・Height両方指定 → 比率は無視してそのまま使う", () => {
    const r = Core.computeDimensions(CURRENT, { widthText: "800", heightText: "600", ratioText: "16:9" });
    assert.equal(r.width, 800);
    assert.equal(r.height, 600);
});

test("computeDimensions: Width＋比率 → 比率から高さを算出", () => {
    const r = Core.computeDimensions(CURRENT, { widthText: "1920", ratioText: "16:9" });
    assert.equal(r.width, 1920);
    assert.equal(r.height, 1080);
});

test("computeDimensions: Height＋比率 → 比率から幅を算出", () => {
    const r = Core.computeDimensions(CURRENT, { heightText: "1080", ratioText: "16:9" });
    assert.equal(r.height, 1080);
    assert.equal(r.width, 1920);
});

test("computeDimensions: 比率のみ指定 → 現在の幅を基準に高さを算出", () => {
    const r = Core.computeDimensions({ width: 1920, height: 1080 }, { ratioText: "1:1" });
    assert.equal(r.width, 1920);
    assert.equal(r.height, 1920);
});

test("computeDimensions: 不正なアスペクト比はエラー", () => {
    const r = Core.computeDimensions(CURRENT, { ratioText: "abc" });
    assert.ok(r.error);
});

test("computeDimensions: 数値でないWidth/Heightはエラー", () => {
    assert.ok(Core.computeDimensions(CURRENT, { widthText: "abc" }).error);
    assert.ok(Core.computeDimensions(CURRENT, { heightText: "abc" }).error);
});

test("computeDimensions: 範囲外（4未満・30000超）はエラー", () => {
    assert.ok(Core.computeDimensions(CURRENT, { widthText: "2" }).error);
    assert.ok(Core.computeDimensions(CURRENT, { widthText: "40000" }).error);
});

// ── computeDurationSeconds ──────────────────────────────────

test("computeDurationSeconds: 空文字なら変更なし", () => {
    const r = Core.computeDurationSeconds("", 30);
    assert.equal(r.durationSeconds, null);
    assert.equal(r.error, null);
});

test("computeDurationSeconds: フレーム数からフレームレートで秒に変換する", () => {
    const r = Core.computeDurationSeconds("300", 30);
    assert.equal(r.durationSeconds, 10);
});

test("computeDurationSeconds: 数値でなければエラー", () => {
    assert.ok(Core.computeDurationSeconds("abc", 30).error);
});

test("computeDurationSeconds: 0以下や長すぎる値はエラー", () => {
    assert.ok(Core.computeDurationSeconds("0", 30).error);
    assert.ok(Core.computeDurationSeconds("-10", 30).error);
    assert.ok(Core.computeDurationSeconds("99999999", 30).error);
});

// ── shouldExtendLayers ──────────────────────────────────────

test("shouldExtendLayers: 新しい方が長い秒数のときだけtrue", () => {
    assert.equal(Core.shouldExtendLayers(10, 5), true);
    assert.equal(Core.shouldExtendLayers(5, 10), false);
    assert.equal(Core.shouldExtendLayers(5, 5), false);
});

test("shouldExtendLayers: フレーム数と秒数を混同しない（旧スクリプトの不具合の再発防止）", () => {
    // 旧スクリプトは「入力されたフレーム数(300)」と「現在のDuration(秒, 5)」を直接比較していたため、
    // フレームレートが1を超える限りほぼ常にtrue判定になってしまっていた。
    // 新ロジックはどちらも秒に揃えてから比較するため、実際に短くなる場合は正しくfalseになる。
    const newDurationSeconds = 300 / 60; // 5秒（60fpsで300フレーム）
    const oldDurationSeconds = 10;       // 現在10秒
    assert.equal(Core.shouldExtendLayers(newDurationSeconds, oldDurationSeconds), false);
});

// ── computeRecenterOffset ───────────────────────────────────

test("computeRecenterOffset: サイズが増えたら正、減ったら負のオフセット", () => {
    assert.equal(Core.computeRecenterOffset(1000, 1200), 100);
    assert.equal(Core.computeRecenterOffset(1200, 1000), -100);
    assert.equal(Core.computeRecenterOffset(1000, 1000), 0);
});

// ── extendLayersToNewEnd ────────────────────────────────────

test("extendLayersToNewEnd: comp終端まで達しているレイヤーだけ伸ばす", () => {
    const layers = [
        { outPoint: 10, locked: false },  // compEndちょうど → 伸ばす
        { outPoint: 5,  locked: false },  // compEnd未満 → 伸ばさない
        { outPoint: 12, locked: false }   // compEndを超えている → 伸ばす
    ];
    const count = Core.extendLayersToNewEnd(layers, 10, 20);
    assert.equal(count, 2);
    assert.equal(layers[0].outPoint, 20);
    assert.equal(layers[1].outPoint, 5);
    assert.equal(layers[2].outPoint, 20);
});

test("extendLayersToNewEnd: ロックされたレイヤーも一時解除して伸ばし、ロックを戻す", () => {
    const layers = [{ outPoint: 10, locked: true }];
    Core.extendLayersToNewEnd(layers, 10, 20);
    assert.equal(layers[0].outPoint, 20);
    assert.equal(layers[0].locked, true);
});
