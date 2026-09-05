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

    // Left Level / Right Pan に設定する値（キーフレームなしの静的値）
    var TARGET_PERCENT = 0;

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

    var ns = {
        DEFAULT_COMP_WIDTH:        DEFAULT_COMP_WIDTH,
        DEFAULT_COMP_HEIGHT:       DEFAULT_COMP_HEIGHT,
        DEFAULT_COMP_PIXEL_ASPECT: DEFAULT_COMP_PIXEL_ASPECT,
        DEFAULT_COMP_FRAME_RATE:   DEFAULT_COMP_FRAME_RATE,
        TARGET_PERCENT:            TARGET_PERCENT,
        filterAudioOnlyItems:      filterAudioOnlyItems,
        buildCompParams:           buildCompParams
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = ns;          // Node（テストから require）
    } else {
        global.AudioStereoFadeCompCore = ns;   // ExtendScript（#include後、グローバルに生える）
    }

})(this);
