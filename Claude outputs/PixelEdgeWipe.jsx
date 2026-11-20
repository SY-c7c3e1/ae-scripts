/*
    PixelEdgeWipe.jsx  v0.1
    選択レイヤーに「エッジがピクセル状に崩れるワイプ」をかける。

    仕組み:
      マット用平面 (フラクタルノイズ → グラデーション(元と混合) → モザイク → しきい値)
      を作り、選択レイヤーのルミナンスキーマットに設定する。

    コントロール (マット平面のエフェクト):
      PW Progress    : 0 = 全部見える / 100 = 全部消える
      PW Angle       : ワイプが進む向き (0 = 左→右)
      PW Block Size  : ブロックのサイズ (px)
      PW Randomness  : エッジ付近のバラつき (0 = きれいな階段 / 100 = ほぼランダム)

    ※ エフェクトはマッチネーム指定なので日本語版AEでも動作します。
*/
(function PixelEdgeWipe() {
    var SCRIPT_NAME = "PixelEdgeWipe";

    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) {
        alert("コンポジションを開いて、レイヤーを選択してください。", SCRIPT_NAME);
        return;
    }
    if (comp.selectedLayers.length === 0) {
        alert("ワイプをかけるレイヤーを選択してください。", SCRIPT_NAME);
        return;
    }

    // 選択レイヤーをコピー (途中でレイヤーが増えるため)
    var targets = [];
    for (var i = 0; i < comp.selectedLayers.length; i++) {
        var l = comp.selectedLayers[i];
        if (l instanceof AVLayer || l instanceof ShapeLayer || l instanceof TextLayer) targets.push(l);
    }
    if (targets.length === 0) {
        alert("映像を持つレイヤーを選択してください。", SCRIPT_NAME);
        return;
    }

    app.beginUndoGroup(SCRIPT_NAME);
    try {
        for (var t = 0; t < targets.length; t++) {
            buildWipe(comp, targets[t]);
        }
    } catch (e) {
        alert("エラー: " + e.toString() + "\n(line " + e.line + ")", SCRIPT_NAME);
    }
    app.endUndoGroup();

    // ------------------------------------------------------------
    function buildWipe(comp, target) {
        var matte = comp.layers.addSolid([1, 1, 1], target.name + "_PixelWipeMatte",
            comp.width, comp.height, comp.pixelAspect, comp.duration);
        matte.startTime = 0;
        matte.inPoint = Math.max(0, target.inPoint);
        matte.outPoint = Math.min(comp.duration, target.outPoint);
        matte.moveBefore(target);
        matte.label = 9; // 緑系ラベル(マットだと分かりやすく)

        var fx = matte.property("ADBE Effect Parade");

        // ---- コントロール ----
        var cProg = fx.addProperty("ADBE Slider Control");  cProg.name = "PW Progress";
        var cAng  = fx.addProperty("ADBE Angle Control");   cAng.name  = "PW Angle";
        var cBlk  = fx.addProperty("ADBE Slider Control");  cBlk.name  = "PW Block Size";
        var cRnd  = fx.addProperty("ADBE Slider Control");  cRnd.name  = "PW Randomness";

        cBlk.property(1).setValue(40);
        cRnd.property(1).setValue(40);
        cAng.property(1).setValue(0);

        // 進行度: 現在時間から1秒で 0 → 100 のキー
        var t0 = Math.max(matte.inPoint, Math.min(comp.time, matte.outPoint - 1));
        var prog = cProg.property(1);
        prog.setValueAtTime(t0, 0);
        prog.setValueAtTime(t0 + 1, 100);

        // ---- 1. フラクタルノイズ (ランダム成分) ----
        var noise = fx.addProperty("ADBE Fractal Noise");
        try { noise.property(4).setValue(200); } catch (e1) {} // コントラスト

        // ---- 2. グラデーション (方向成分)。元(ノイズ)と混合 ----
        var ramp = fx.addProperty("ADBE Ramp");
        ramp.property(2).setValue([0, 0, 0, 1]); // 開始色
        ramp.property(4).setValue([1, 1, 1, 1]); // 終了色
        ramp.property(5).setValue(1);            // 直線
        var rampPt =
            'var a = degreesToRadians(effect("PW Angle")(1));\n' +
            'var d = [Math.cos(a), Math.sin(a)];\n' +
            'var c = [thisComp.width / 2, thisComp.height / 2];\n' +
            'var b = effect("PW Block Size")(1);\n' +
            'var L = (Math.abs(thisComp.width * d[0]) + Math.abs(thisComp.height * d[1])) / 2 + b;\n';
        ramp.property(1).expression = rampPt + 'sub(c, mul(d, L));';
        ramp.property(3).expression = rampPt + 'add(c, mul(d, L));';
        // 元の画像とブレンド = ランダム度
        ramp.property(7).expression = 'clamp(effect("PW Randomness")(1), 0, 100);';

        // ---- 3. モザイク ----
        var mosaic = fx.addProperty("ADBE Mosaic");
        mosaic.property(1).expression =
            'Math.max(1, Math.ceil(thisComp.width / Math.max(1, effect("PW Block Size")(1))));';
        mosaic.property(2).expression =
            'Math.max(1, Math.ceil(thisComp.height / Math.max(1, effect("PW Block Size")(1))));';
        mosaic.property(3).setValue(1); // シャープなカラー

        // ---- 4. しきい値 (白黒二値化) ----
        var thr = fx.addProperty("ADBE Threshold2");
        thr.property(1).expression =
            'var p = clamp(effect("PW Progress")(1), 0, 100);\n' +
            'var r = clamp(effect("PW Randomness")(1), 0, 100) / 100;\n' +
            '// ランダム度が高いほど値が中央に寄るので、範囲を詰めて動き出しを早くする\n' +
            'var lo = r * 0.3, hi = 1 - r * 0.3;\n' +
            'p <= 0 ? 0 : linear(p, 0, 100, lo, hi) * 255;';

        // 100% で確実に全部消す
        matte.property("ADBE Transform Group").property("ADBE Opacity").expression =
            'effect("PW Progress")(1) >= 100 ? 0 : 100;';

        // ---- トラックマット設定 ----
        if (typeof target.setTrackMatte === "function") {
            target.setTrackMatte(matte, TrackMatteType.LUMA);   // AE 2023+
        } else {
            target.trackMatteType = TrackMatteType.LUMA;        // 旧バージョン
        }

        matte.selected = true;
        target.selected = false;
    }
})();
