const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../LiveComp.core.js");

test("横長の画像は高さを合わせる（左右がはみ出る）", () => {
  assert.equal(C.fillScalePercent(3840, 1600, 1, 1920, 1080, 1), 67.5);
});

test("縦長の画像は横幅を合わせる（上下がはみ出る）", () => {
  assert.equal(C.fillScalePercent(1080, 2160, 1, 1920, 1080, 1), 177.778);
});

test("同じ比率なら過不足なくぴったり", () => {
  assert.equal(C.fillScalePercent(3840, 2160, 1, 1920, 1080, 1), 50);
});

test("小さい画像は拡大して敷き詰める", () => {
  assert.equal(C.fillScalePercent(960, 540, 1, 1920, 1080, 1), 200);
});

test("どの比率でもコンポに空白ができない", () => {
  for (const [w, h] of [[800, 3000], [5000, 900], [1000, 1000], [1919, 1081]]) {
    const s = C.fillScalePercent(w, h, 1, 1920, 1080, 1) / 100;
    assert.ok(w * s >= 1920 - 0.01 && h * s >= 1080 - 0.01, `${w}x${h}`);
  }
});

test("ピクセル縦横比を考慮する", () => {
  // 1440x1080 で PA 1.333 → 表示上 1920x1080 相当 → 100%
  assert.equal(C.fillScalePercent(1440, 1080, 4 / 3, 1920, 1080, 1), 100);
});

test("文字サイズは高さの1/9（1080pxで120px）", () => {
  assert.equal(C.textSize(1080), 120);
});

test("コンポ名は LIVE_comp、重なれば _02 から連番（画像名は使わない）", () => {
  assert.equal(C.nextCompName([]), "LIVE_comp");
  assert.equal(C.nextCompName(["stage.png", "LIVE_comp"]), "LIVE_comp_02");
  assert.equal(C.nextCompName(["LIVE_comp", "LIVE_comp_02"]), "LIVE_comp_03");
  assert.equal(C.nextCompName(["LIVE_comp", "LIVE_comp_03"]), "LIVE_comp_02");
  const many = ["LIVE_comp"]; for (let i = 2; i <= 9; i++) many.push("LIVE_comp_0" + i);
  assert.equal(C.nextCompName(many), "LIVE_comp_10");
});

test("フレームレートの選択位置（不明な値は30）", () => {
  assert.equal(C.FRAME_RATES[C.frameRateIndex("59.94")].value, 59.94);
  assert.equal(C.FRAME_RATES[C.frameRateIndex("abc")].label, "30");
});

test("長さの入力チェック", () => {
  assert.equal(C.parseDuration("30"), 30);
  assert.equal(C.parseDuration("12.5秒"), 12.5);
  assert.equal(C.parseDuration("0"), null);
  assert.equal(C.parseDuration(""), null);
});
