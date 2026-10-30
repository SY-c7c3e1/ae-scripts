const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../ExportMarkerFrames.core.js");

const markers = [
  { time: 2, duration: 0, comment: "サビ", source: "Comp" },
  { time: 0.5, duration: 1, comment: "", source: "♪music.wav" },
  { time: 1, duration: 0, comment: "  照明, 暗転  ", source: "Comp" },
];

test("コメント付きのみ：空コメントは除外、フレーム順に並ぶ", () => {
  const rows = C.buildRows(markers, { fps: 30, commentOnly: true });
  assert.deepEqual(rows.map((r) => [r.name, r.frame, r.comment]), [
    ["M001", 30, "照明, 暗転"],
    ["M002", 60, "サビ"],
  ]);
});

test("すべて：コメントなしも含む。長さはフレームに換算", () => {
  const rows = C.buildRows(markers, { fps: 30, commentOnly: false });
  assert.equal(rows.length, 3);
  assert.deepEqual([rows[0].frame, rows[0].endFrame, rows[0].durationFrames], [15, 45, 30]);
});

test("開始フレームの分だけずれる（表示どおりの番号）", () => {
  const rows = C.buildRows([{ time: 1, duration: 0, comment: "a" }], { fps: 24, startFrame: 1001 });
  assert.equal(rows[0].frame, 1025);
});

test("29.97 でも誤差なくフレームになる", () => {
  const rows = C.buildRows([{ time: 1001 / 30000 * 300, duration: 0, comment: "x" }], { fps: 29.97 });
  assert.equal(rows[0].frame, 300);
});

test("タイムコード", () => {
  assert.equal(C.timecode(0, 30), "00:00:00:00");
  assert.equal(C.timecode(30 * 3661 + 5, 30), "01:01:01:05");
  assert.equal(C.timecode(59, 59.94), "00:00:00:59");
});

test("CSV：カンマ・引用符・改行を含むコメントは囲む", () => {
  assert.equal(C.csvCell("a,b"), '"a,b"');
  assert.equal(C.csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(C.csvCell("1行目\n2行目"), '"1行目\n2行目"');
  assert.equal(C.csvCell("普通"), "普通");
});

test("CSV全体：見出し＋行", () => {
  const csv = C.toCsv(C.buildRows(markers, { fps: 30, commentOnly: true }));
  const lines = csv.trim().split("\r\n");
  assert.equal(lines[0], "Name,Frame,EndFrame,DurationFrames,Seconds,Timecode,FPS,Source,Comment");
  assert.equal(lines[1], 'M001,30,30,0,1,00:00:01:00,30,Comp,"照明, 暗転"');
});

test("ファイル名", () => {
  assert.equal(C.defaultFileName("Main/Comp:01"), "Main_Comp_01_markers.csv");
});
