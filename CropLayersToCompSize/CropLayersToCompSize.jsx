// CropLayersToCompSize.jsx
// アクティブコンポ内の各レイヤー（コンプ以外のソース）を、コンポと同じ
// サイズの新規プリコンプに包んで置き換える。
//
// 使い方：
//   1. 対象のコンポをアクティブにする
//   2. 実行すると、各レイヤーが「レイヤー名_Cropped」というプリコンプに
//      置き換わる（ソースがコンプのレイヤーは対象外）

(function() {
    app.beginUndoGroup("Crop Layers to Comp Size");

    var comp = app.project.activeItem;
    if (!(comp && comp instanceof CompItem)) {
        alert("アクティブなコンポジションを選択してください。");
        return;
    }

    var layers = comp.layers;
    for (var i = 1; i <= layers.length; i++) {
        var layer = layers[i];
        if (layer instanceof AVLayer) {
            // レイヤーのソースがコンポジションの場合は処理をスキップ
            if (layer.source instanceof CompItem) continue;

            // 新しいコンポジションを作成
            var newComp = app.project.items.addComp(layer.name + "_Cropped", comp.width, comp.height, comp.pixelAspect, comp.duration, comp.frameRate);

            // 元のレイヤーを新しいコンポジションにコピー
            var newLayer = newComp.layers.add(layer.source);

            // レイヤーのプロパティをコピー
            newLayer.transform.position.setValue(layer.transform.position.value);
            newLayer.transform.scale.setValue(layer.transform.scale.value);
            newLayer.transform.rotation.setValue(layer.transform.rotation.value);
            newLayer.transform.opacity.setValue(layer.transform.opacity.value);

            // 元のレイヤーを新しいコンポジションに置き換え
            var newLayerInComp = comp.layers.add(newComp);
            newLayerInComp.moveBefore(layer);
            layer.remove();
        }
    }

    app.endUndoGroup();
})();
