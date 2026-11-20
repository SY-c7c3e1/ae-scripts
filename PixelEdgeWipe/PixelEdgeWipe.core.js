// PixelEdgeWipe.core.js
// C7_PixelEdgeWipe.jsx のロジック本体（UI・AE非依存）。Nodeでテストできる。
// マット平面に入れるエクスプレッション文字列と、初期値をここで決める。

(function (global) {

    // コントロール（エフェクト名）。日本語版AEでも名前がずれないよう英字にする
    var CTRL = {
        progress:   "PW Progress",
        angle:      "PW Angle",
        blockSize:  "PW Block Size",
        randomness: "PW Randomness"
    };

    var DEFAULTS = {
        blockSize: 40,
        randomness: 40,
        angle: 0,
        duration: 1,          // 進行度キーの長さ（秒）
        noiseContrast: 200
    };

    function ctrl(name) {
        return 'effect("' + name + '")(1)';
    }

    // グラデーションの開始点(isEnd=false)/終了点(isEnd=true)
    // コンポ中心から角度方向に、画面の端＋ブロック1個分まで伸ばす
    function rampPointExpression(isEnd) {
        return [
            'var a = degreesToRadians(' + ctrl(CTRL.angle) + ');',
            'var d = [Math.cos(a), Math.sin(a)];',
            'var c = [thisComp.width / 2, thisComp.height / 2];',
            'var b = ' + ctrl(CTRL.blockSize) + ';',
            'var L = (Math.abs(thisComp.width * d[0]) + Math.abs(thisComp.height * d[1])) / 2 + b;',
            (isEnd ? 'add(c, mul(d, L));' : 'sub(c, mul(d, L));')
        ].join('\n');
    }

    // グラデーションの「元の画像とブレンド」= ランダム度（下にあるノイズが混ざる）
    function rampBlendExpression() {
        return 'clamp(' + ctrl(CTRL.randomness) + ', 0, 100);';
    }

    // モザイクのブロック数（isVertical=true で垂直）
    function mosaicBlocksExpression(isVertical) {
        var size = isVertical ? 'thisComp.height' : 'thisComp.width';
        return 'Math.max(1, Math.ceil(' + size + ' / Math.max(1, ' + ctrl(CTRL.blockSize) + ')));';
    }

    // しきい値（0〜255）。ランダム度が高いほど値が中央に寄るので範囲を詰める
    function thresholdExpression() {
        return [
            'var p = clamp(' + ctrl(CTRL.progress) + ', 0, 100);',
            'var r = clamp(' + ctrl(CTRL.randomness) + ', 0, 100) / 100;',
            'var lo = r * 0.3, hi = 1 - r * 0.3;',
            'p <= 0 ? 0 : linear(p, 0, 100, lo, hi) * 255;'
        ].join('\n');
    }

    // 100% のときは確実に全部消す（マットの不透明度を0に）
    function matteOpacityExpression() {
        return ctrl(CTRL.progress) + ' >= 100 ? 0 : 100;';
    }

    // 進行度キーを打つ開始時間：現在時間。ただし1秒ぶんがレイヤー内に収まるよう調整
    function keyStartTime(currentTime, inPoint, outPoint, duration) {
        var d = duration > 0 ? duration : DEFAULTS.duration;
        var t = Math.min(currentTime, outPoint - d);
        return Math.max(inPoint, t);
    }

    var ns = {
        CTRL: CTRL,
        DEFAULTS: DEFAULTS,
        rampPointExpression: rampPointExpression,
        rampBlendExpression: rampBlendExpression,
        mosaicBlocksExpression: mosaicBlocksExpression,
        thresholdExpression: thresholdExpression,
        matteOpacityExpression: matteOpacityExpression,
        keyStartTime: keyStartTime
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = ns;
    } else {
        global.PixelEdgeWipeCore = ns;
    }
})(this);
