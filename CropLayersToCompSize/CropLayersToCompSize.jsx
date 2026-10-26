// CropLayersToCompSize.jsx
// アクティブなコンポ内の各レイヤー（コンポ以外の素材）を、元コンポと同じサイズの
// 新しいコンポ（「レイヤー名_Cropped」）に入れ替える。
// 位置・スケール・回転・不透明度は新しいコンポ内のレイヤーにコピーされる。
//
// 旧ファイル名: crop_layer.jsx（Script_for_AEpanel/01comp_layer から移動）

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