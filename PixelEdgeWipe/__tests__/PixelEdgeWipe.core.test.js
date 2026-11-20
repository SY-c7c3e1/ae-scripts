const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../PixelEdgeWipe.core.js");

// AEのエクスプレッション環境を最小限まねて、生成した文字列を実際に評価する
function runExpr(src, ctrls, comp) {
  const env = {
    thisComp: comp || { width: 1920, height: 1080 },
    effect: (name) => () => {
      if (!(name in ctrls)) throw new Error("unknown control: " + name);
      return ctrls[name];
    },
    degreesToRadians: (d) => d * Math.PI / 180,
    add: (a, b) => a.map((v, i) => v + b[i]),
    sub: (a, b) => a.map((v, i) => v - b[i]),
    mul: (a, s) => a.map((v) => v * s),
    clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)),
    linear: (t, t0, t1, v0, v1) => {
      if (t <= t0) return v0;
      if (t >= t1) return v1;
      return v0 + (v1 - v0) * (t - t0) / (t1 - t0);
    },
  };
  const names = Object.keys(env);
  const lines = src.trim().split("\n");
  const last = lines.pop().replace(/;$/, "");
  return new Function(...names, lines.join("\n") + "\nreturn (" + last + ");")(...names.map((n) => env[n]));
}

const base = { "PW Progress": 0, "PW Angle": 0, "PW Block Size": 40, "PW Randomness": 40 };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test("角度0：グラデーションは左外→右外（中央の高さ）", () => {
  const s = runExpr(C.rampPointExpression(false), base);
  const e = runExpr(C.rampPointExpression(true), base);
  near(s[0], -40); near(s[1], 540);
  near(e[0], 1960); near(e[1], 540);
});

test("角度90：上外→下外", () => {
  const c = { ...base, "PW Angle": 90 };
  const s = runExpr(C.rampPointExpression(false), c);
  const e = runExpr(C.rampPointExpression(true), c);
  near(s[0], 960); near(s[1], -40);
  near(e[0], 960); near(e[1], 1120);
});

test("どの角度でも画面の四隅がグラデーションの範囲内に入る", () => {
  for (let a = 0; a < 360; a += 15) {
    const c = { ...base, "PW Angle": a };
    const s = runExpr(C.rampPointExpression(false), c);
    const e = runExpr(C.rampPointExpression(true), c);
    const dx = e[0] - s[0], dy = e[1] - s[1], len2 = dx * dx + dy * dy;
    for (const [x, y] of [[0, 0], [1920, 0], [0, 1080], [1920, 1080]]) {
      const t = ((x - s[0]) * dx + (y - s[1]) * dy) / len2;
      assert.ok(t > 0 && t < 1, `angle ${a} corner ${x},${y} t=${t}`);
    }
  }
});

test("モザイクのブロック数", () => {
  assert.equal(runExpr(C.mosaicBlocksExpression(false), base), 48);
  assert.equal(runExpr(C.mosaicBlocksExpression(true), base), 27);
  assert.equal(runExpr(C.mosaicBlocksExpression(false), { ...base, "PW Block Size": 0 }), 1920);
});

test("しきい値：0%で0、100%で上限、途中は単調に増える", () => {
  let prev = -1;
  for (let p = 0; p <= 100; p += 5) {
    const v = runExpr(C.thresholdExpression(), { ...base, "PW Progress": p });
    assert.ok(v >= prev && v >= 0 && v <= 255, `p=${p} v=${v}`);
    prev = v;
  }
  assert.equal(runExpr(C.thresholdExpression(), base), 0);
});

test("ランダム度0なら 0〜255 をまるごと使う", () => {
  const c = { ...base, "PW Randomness": 0, "PW Progress": 100 };
  near(runExpr(C.thresholdExpression(), c), 255);
});

test("マットの不透明度：100%で0", () => {
  assert.equal(runExpr(C.matteOpacityExpression(), { ...base, "PW Progress": 100 }), 0);
  assert.equal(runExpr(C.matteOpacityExpression(), { ...base, "PW Progress": 50 }), 100);
});

test("キーの開始時間がレイヤー内に収まる", () => {
  assert.equal(C.keyStartTime(2, 0, 10, 1), 2);
  assert.equal(C.keyStartTime(9.5, 0, 10, 1), 9);
  assert.equal(C.keyStartTime(-1, 0, 10, 1), 0);
});
