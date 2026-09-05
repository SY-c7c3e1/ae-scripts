// AudioStereoMixComp.core.test.js
// AudioStereoMixComp.core.js のロジックを、AE本体を起動せずに検証するテスト。
// 実行: npm test （リポジトリ直下） または node --test このファイル

const assert = require("node:assert/strict");
const { test } = require("node:test");
const Core = require("../AudioStereoMixComp.core.js");

// ── filterAudioOnlyItems ────────────────────────────────────

test("filterAudioOnlyItems: 音声のみのアイテムだけを残す", () => {
    const items = [
        { name: "voice.wav", hasAudio: true,  hasVideo: false },
        { name: "movie.mp4", hasAudio: true,  hasVideo: true  }, // 映像+音声は対象外
        { name: "silent.mp4", hasAudio: false, hasVideo: true  }, // 音声なしも対象外
        { name: "bgm.mp3",   hasAudio: true,  hasVideo: false }
    ];
    const result = Core.filterAudioOnlyItems(items);
    assert.deepEqual(result.map((i) => i.name), ["voice.wav", "bgm.mp3"]);
});

test("filterAudioOnlyItems: 該当なしなら空配列", () => {
    const items = [{ name: "movie.mp4", hasAudio: true, hasVideo: true }];
    assert.deepEqual(Core.filterAudioOnlyItems(items), []);
});

// ── buildCompParams ──────────────────────────────────────────

test("buildCompParams: デフォルト値でコンポパラメータを組み立てる", () => {
    const audioItem = { name: "bgm.mp3", duration: 123.4 };
    const params = Core.buildCompParams(audioItem);

    assert.equal(params.name, "bgm.mp3");
    assert.equal(params.duration, 123.4);
    assert.equal(params.width, Core.DEFAULT_COMP_WIDTH);
    assert.equal(params.height, Core.DEFAULT_COMP_HEIGHT);
    assert.equal(params.pixelAspect, Core.DEFAULT_COMP_PIXEL_ASPECT);
    assert.equal(params.frameRate, Core.DEFAULT_COMP_FRAME_RATE);
});

test("buildCompParams: overridesで値を上書きできる", () => {
    const audioItem = { name: "bgm.mp3", duration: 10 };
    const params = Core.buildCompParams(audioItem, { width: 3840, height: 2160, frameRate: 59.94 });

    assert.equal(params.width, 3840);
    assert.equal(params.height, 2160);
    assert.equal(params.frameRate, 59.94);
    assert.equal(params.pixelAspect, Core.DEFAULT_COMP_PIXEL_ASPECT);
});
