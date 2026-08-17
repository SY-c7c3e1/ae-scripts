// AutoCropComposition.jsx
// After Effects用の自動クロップスクリプト
// コンポジション内の使用されている領域を検出し、余白を削除します

(function() {
    // アクティブコンポジションの取得を試みる
    var activeComp = app.project.activeItem;

    // コンポジションが選択されているか確認
    if (!activeComp || !(activeComp instanceof CompItem)) {
        alert("コンポジションを選択してください。");
        return;
    }

    app.beginUndoGroup("Auto Crop Composition");

    try {
        // コンポジションの境界を探す
        var bounds = findUsedBounds(activeComp);

        if (bounds) {
            // 余白をカットし、コンポジションサイズを変更
            resizeComposition(activeComp, bounds);
            alert("コンポジションを自動クロップしました。");
        } else {
            alert("使用されている領域が見つかりませんでした。");
        }
    } catch (e) {
        alert("エラーが発生しました: " + e.toString());
    }

    app.endUndoGroup();

    // コンポジション内の使用されている領域の境界を見つける関数
    function findUsedBounds(comp) {
        var left = comp.width;
        var top = comp.height;
        var right = 0;
        var bottom = 0;
        var foundContent = false;

        // 現在のタイムを保存
        var currentTime = comp.time;

        // レンダリング設定
        var samplingRate = 1; // フレーム間隔（パフォーマンス向上のため）
        var startFrame = 0;
        var endFrame = comp.numLayers > 0 ? comp.workAreaDuration * comp.frameRate : 0;

        for (var frame = startFrame; frame <= endFrame; frame += samplingRate) {
            comp.time = frame / comp.frameRate;

            // すべてのレイヤーをチェック
            for (var i = 1; i <= comp.numLayers; i++) {
                var layer = comp.layer(i);

                // レイヤーが現在のフレームで表示されているか確認
                if (layer.enabled && layer.inPoint <= comp.time && layer.outPoint > comp.time) {
                    // レイヤーの境界を取得
                    if (layer.sourceRectAtTime(comp.time, false)) {
                        var rect = layer.sourceRectAtTime(comp.time, false);
                        var layerTransform = layer.transform;

                        // レイヤーの位置と拡大縮小を考慮
                        var scale = layerTransform.scale.valueAtTime(comp.time, false);
                        var scaleX = scale[0] / 100;
                        var scaleY = scale[1] / 100;

                        var position = layerTransform.position.valueAtTime(comp.time, false);
                        var anchorPoint = layerTransform.anchorPoint.valueAtTime(comp.time, false);

                        // レイヤーの実際の位置を計算
                        var layerLeft = position[0] - anchorPoint[0] * scaleX + rect.left * scaleX;
                        var layerTop = position[1] - anchorPoint[1] * scaleY + rect.top * scaleY;
                        var layerRight = layerLeft + rect.width * scaleX;
                        var layerBottom = layerTop + rect.height * scaleY;

                        // 境界を更新
                        left = Math.min(left, layerLeft);
                        top = Math.min(top, layerTop);
                        right = Math.max(right, layerRight);
                        bottom = Math.max(bottom, layerBottom);

                        foundContent = true;
                    }
                }
            }
        }

        // 元のタイム設定に戻す
        comp.time = currentTime;

        if (!foundContent) {
            return null;
        }

        // 整数値に丸める
        left = Math.floor(left);
        top = Math.floor(top);
        right = Math.ceil(right);
        bottom = Math.ceil(bottom);

        // 境界が有効かチェック
        if (left >= right || top >= bottom) {
            return null;
        }

        return {
            left: left,
            top: top,
            right: right,
            bottom: bottom,
            width: right - left,
            height: bottom - top
        };
    }

    // コンポジションのサイズを変更し、レイヤーを調整する関数
    function resizeComposition(comp, bounds) {
        // 位置のオフセットを計算
        var offsetX = -bounds.left;
        var offsetY = -bounds.top;

        // すべてのレイヤーの位置を調整
        for (var i = 1; i <= comp.numLayers; i++) {
            var layer = comp.layer(i);
            var layerPosition = layer.transform.position;

            // アニメーション化されたプロパティーかチェック
            if (layerPosition.numKeys > 0) {
                // すべてのキーフレームを調整
                for (var k = 1; k <= layerPosition.numKeys; k++) {
                    var keyTime = layerPosition.keyTime(k);
                    var keyValue = layerPosition.valueAtTime(keyTime, false);

                    // 新しい位置を設定
                    layerPosition.setValueAtTime(keyTime, [keyValue[0] + offsetX, keyValue[1] + offsetY]);
                }
            } else {
                // 静的なプロパティーを調整
                var pos = layerPosition.value;
                layerPosition.setValue([pos[0] + offsetX, pos[1] + offsetY]);
            }
        }

        // コンポジションのサイズを新しい境界に合わせて変更
        comp.width = bounds.width;
        comp.height = bounds.height;
    }
})();
