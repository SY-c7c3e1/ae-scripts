// C7_PixelEdgeWipe.jsx
// 選択レイヤーに「エッジがピクセル状に崩れるワイプ」をかける。
//
//   選択レイヤーの上にマット用の平面を作り、ルミナンスキーマットに設定する。
//   マット平面のエフェクト:
//     フラクタルノイズ → グラデーション（ノイズと混ぜる）→ モザイク → しきい値
//
//   コントロール（マット平面の一番上）:
//     PW Progress   : 0 = 全部見える / 100 = 全部消える（現在時間から1秒のキー入り）
//     PW Angle      : 消えていく向き（0 = 左→右）
//     PW Block Size : ブロックの大きさ（px）
//     PW Randomness : エッジのバラつき（0 = きれいな階段 / 大きいほど散らばる）
//
//   ・現れる方向にしたいときは Angle を180°回し、Progress のキーを 100→0 にする
//   ・散らばる塊の大きさは、マットの「フラクタルノイズ」のスケールで調整
//   ・エフェクトはマッチネーム指定なので、日本語版AEでも動く
//
// ロジック本体は PixelEdgeWipe.core.js（Node上でテスト済み）。

#include "PixelEdgeWipe.core.js"

(function () {
    var C = PixelEdgeWipeCore;
    var NAME = "C7_PixelEdgeWipe";

    var comp = app.project ? app.project.activeItem : null;
    if (!(comp instanceof CompItem)) {
        alert("コンポジションを開いて、レイヤーを選択してください。", NAME);
        return;
    }

    // 選択レイヤーをコピー（途中でレイヤーが増えるため）
    var targets = [];
    for (var i = 0; i < comp.selectedLayers.length; i++) {
        var l = comp.selectedLayers[i];
        if (l instanceof AVLayer || l instanceof ShapeLayer || l instanceof TextLayer) targets.push(l);
    }
    if (targets.length === 0) {
        alert("ワイプをかけるレイヤーを選択してください。", NAME);
        return;
    }

    app.beginUndoGroup(NAME);
    try {
        for (var t = 0; t < targets.length; t++) buildWipe(comp, targets[t]);
    } catch (e) {
        alert("エラー: " + e.toString() + "\n(line " + e.line + ")", NAME);
    }
    app.endUndoGroup();

    function buildWipe(comp, target) {
        var matte = comp.layers.addSolid([1, 1, 1], target.name + "_PixelWipeMatte",
            comp.width, comp.height, comp.pixelAspect, comp.duration);
        matte.startTime = 0;
        matte.inPoint = Math.max(0, target.inPoint);
        matte.outPoint = Math.min(comp.duration, target.outPoint);
        matte.moveBefore(target);

        var fx = matte.property("ADBE Effect Parade");

        // ---- コントロール ----
        var cProg = fx.addProperty("ADBE Slider Control"); cProg.name = C.CTRL.progress;
        var cAng  = fx.addProperty("ADBE Angle Control");  cAng.name  = C.CTRL.angle;
        var cBlk  = fx.addProperty("ADBE Slider Control"); cBlk.name  = C.CTRL.blockSize;
        var cRnd  = fx.addProperty("ADBE Slider Control"); cRnd.name  = C.CTRL.randomness;
        cAng.property(1).setValue(C.DEFAULTS.angle);
        cBlk.property(1).setValue(C.DEFAULTS.blockSize);
        cRnd.property(1).setValue(C.DEFAULTS.randomness);

        var t0 = C.keyStartTime(comp.time, matte.inPoint, matte.outPoint, C.DEFAULTS.duration);
        var prog = cProg.property(1);
        prog.setValueAtTime(t0, 0);
        prog.setValueAtTime(t0 + C.DEFAULTS.duration, 100);

        // ---- 1. フラクタルノイズ（ランダム成分）----
        var noise = fx.addProperty("ADBE Fractal Noise");
        try { noise.property(4).setValue(C.DEFAULTS.noiseContrast); } catch (e1) {} // コントラスト

        // ---- 2. グラデーション（方向成分）。ノイズと混ぜる ----
        var ramp = fx.addProperty("ADBE Ramp");
        ramp.property(2).setValue([0, 0, 0, 1]); // 開始色
        ramp.property(4).setValue([1, 1, 1, 1]); // 終了色
        ramp.property(5).setValue(1);            // 直線
        ramp.property(1).expression = C.rampPointExpression(false);
        ramp.property(3).expression = C.rampPointExpression(true);
        ramp.property(7).expression = C.rampBlendExpression();

        // ---- 3. モザイク ----
        var mosaic = fx.addProperty("ADBE Mosaic");
        mosaic.property(1).expression = C.mosaicBlocksExpression(false);
        mosaic.property(2).expression = C.mosaicBlocksExpression(true);
        mosaic.property(3).setValue(1); // シャープなカラー

        // ---- 4. しきい値（白黒にする）----
        var thr = fx.addProperty("ADBE Threshold2");
        thr.property(1).expression = C.thresholdExpression();

        matte.property("ADBE Transform Group").property("ADBE Opacity").expression =
            C.matteOpacityExpression();

        // ---- トラックマット ----
        if (typeof target.setTrackMatte === "function") {
            target.setTrackMatte(matte, TrackMatteType.LUMA);   // AE 2023+
        } else {
            target.trackMatteType = TrackMatteType.LUMA;
        }
    }
})();
