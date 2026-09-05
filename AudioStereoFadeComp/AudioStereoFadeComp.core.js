// AudioStereoFadeComp.core.js
// AudioStereoFadeComp のロジック本体（UI非依存）。
//
// ExtendScript側（C7_AudioStereoFadeComp.jsx）からは #include で読み込み、
// テスト側（__tests__/AudioStereoFadeComp.core.test.js）からは Node の require() で読み込む。
// そのためAEの実オブジェクト（AVItem, CompItem等）には一切依存せず、
// 必要な値はすべて引数で受け取る（オブジェクトは{hasAudio, hasVideo, duration, name, ...}の形で十分）。

(function (global) {

    // コンポ作成時のデフォルト値（音源のみのため映像サイズ自体に意味はない）
    var DEFAULT_COMP_WIDTH        = 1920;
    var DEFAULT_COMP_HEIGHT       = 1080;
    var DEFAULT_COMP_PIXEL_ASPECT = 1;
    var DEFAULT_COMP_FRAME_RATE   = 30;

    // Left Level / Right Pan のフェード幅（100%→0%）
    var FADE_START_PERCENT = 100;
    var FADE_END_PERCENT   = 0;

    // 選択アイテムから「音声のみ」のフッテージだけを抽出する。
    // 動画+音声のファイルは対象外（hasVideoがtrueのものは除外）。
    function filterAudioOnlyItems(items) {
        var result = [];
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (it && it.hasAudio && !it.hasVideo) {
                result.push(it);
            }
        }
        return result;
    }

    // 音源アイテムから、新規コンポ作成に渡すパラメータ一式を組み立てる。
    // overridesで width/height/pixelAspect/frameRate を上書き可能。
    function buildCompParams(audioItem, overrides) {
        overrides = overrides || {};
        return {
            name:        audioItem.name,
            width:       overrides.width       || DEFAULT_COMP_WIDTH,
            height:      overrides.height      || DEFAULT_COMP_HEIGHT,
            pixelAspect: overrides.pixelAspect || DEFAULT_COMP_PIXEL_ASPECT,
            duration:    audioItem.duration,
            frameRate:   overrides.frameRate   || DEFAULT_COMP_FRAME_RATE
        };
    }

    // Stereo MixerのLeft Level / Right Panに設定するキーフレーム列を組み立てる。
    // レイヤー先頭(0秒)で100%、レイヤー末尾(duration秒)で0%になるよう2点のみ返す。
    function buildFadeKeyframes(duration) {
        return [
            { time: 0,        value: FADE_START_PERCENT },
            { time: duration, value: FADE_END_PERCENT }
        ];
    }

    var ns = {
        DEFAULT_COMP_WIDTH:        DEFAULT_COMP_WIDTH,
        DEFAULT_COMP_HEIGHT:       DEFAULT_COMP_HEIGHT,
        DEFAULT_COMP_PIXEL_ASPECT: DEFAULT_COMP_PIXEL_ASPECT,
        DEFAULT_COMP_FRAME_RATE:   DEFAULT_COMP_FRAME_RATE,
        FADE_START_PERCENT:        FADE_START_PERCENT,
        FADE_END_PERCENT:          FADE_END_PERCENT,
        filterAudioOnlyItems:      filterAudioOnlyItems,
        buildCompParams:           buildCompParams,
        buildFadeKeyframes:        buildFadeKeyframes
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = ns;          // Node（テストから require）
    } else {
        global.AudioStereoFadeCompCore = ns;   // ExtendScript（#include後、グローバルに生える）
    }

})(this);
