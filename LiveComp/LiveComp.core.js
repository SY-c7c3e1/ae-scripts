// LiveComp.core.js
// C7_LiveComp.jsx のロジック本体（UI・AE非依存）。Nodeでテストできる。

(function (global) {

    var COMP_WIDTH = 1920;
    var COMP_HEIGHT = 1080;

    // フレームレートの選択肢（表示名と数値）
    var FRAME_RATES = [
        { label: "23.976", value: 23.976 },
        { label: "24", value: 24 },
        { label: "25", value: 25 },
        { label: "29.97", value: 29.97 },
        { label: "30", value: 30 },
        { label: "50", value: 50 },
        { label: "59.94", value: 59.94 },
        { label: "60", value: 60 }
    ];
    var DEFAULT_FRAME_RATE_LABEL = "30";

    // 「LIVE」の文字サイズ：コンポの高さの 1/9（1080px で 120px）
    var TEXT_SIZE_RATIO = 1 / 9;
    var TEXT_OPACITY = 70;
    var TEXT_FONT = "MS-Gothic"; // MSゴシックのPostScript名

    function frameRateIndex(label) {
        for (var i = 0; i < FRAME_RATES.length; i++) {
            if (FRAME_RATES[i].label === String(label)) return i;
        }
        for (var j = 0; j < FRAME_RATES.length; j++) {
            if (FRAME_RATES[j].label === DEFAULT_FRAME_RATE_LABEL) return j;
        }
        return 0;
    }

    // 画像を比率を変えずに、コンポに空白ができないように敷き詰めるときのスケール（%）
    // （コンポより縦長の画像は横幅を合わせ、横長の画像は高さを合わせる。はみ出た分は切れる）
    // itemPixelAspect / compPixelAspect は素材・コンポのピクセル縦横比（通常 1）
    function fillScalePercent(itemWidth, itemHeight, itemPixelAspect, compWidth, compHeight, compPixelAspect) {
        if (!(itemWidth > 0) || !(itemHeight > 0)) return 100;
        var ipa = itemPixelAspect > 0 ? itemPixelAspect : 1;
        var cpa = compPixelAspect > 0 ? compPixelAspect : 1;
        var displayWidth = itemWidth * ipa / cpa;
        var s = Math.max(compWidth / displayWidth, compHeight / itemHeight);
        // 小数第3位で切り上げ（丸めでわずかな隙間ができないように）
        return Math.ceil(s * 100 * 1000 - 1e-6) / 1000;
    }

    function textSize(compHeight) {
        return Math.round(compHeight * TEXT_SIZE_RATIO);
    }

    // コンポ名：最初は "LIVE_comp"、すでにあれば "LIVE_comp_02", "LIVE_comp_03" … と連番
    // existingNames はプロジェクト内のアイテム名の配列
    var BASE_NAME = "LIVE_comp";
    function nextCompName(existingNames) {
        var used = {};
        for (var i = 0; i < existingNames.length; i++) used[existingNames[i]] = true;
        if (!used[BASE_NAME]) return BASE_NAME;
        for (var n = 2; n < 10000; n++) {
            var name = BASE_NAME + "_" + (n < 10 ? "0" + n : String(n));
            if (!used[name]) return name;
        }
        return BASE_NAME + "_" + new Date().getTime();
    }

    // 入力された長さ（秒）を検証。不正なら null
    function parseDuration(text) {
        var n = parseFloat(String(text).replace(/[^\d.]/g, ""));
        if (!(n > 0) || n > 10800) return null;
        return n;
    }

    var ns = {
        COMP_WIDTH: COMP_WIDTH,
        COMP_HEIGHT: COMP_HEIGHT,
        FRAME_RATES: FRAME_RATES,
        TEXT_OPACITY: TEXT_OPACITY,
        TEXT_FONT: TEXT_FONT,
        frameRateIndex: frameRateIndex,
        fillScalePercent: fillScalePercent,
        textSize: textSize,
        nextCompName: nextCompName,
        parseDuration: parseDuration
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = ns;
    } else {
        global.LiveCompCore = ns;
    }

})(this);
