// ExportMarkerFrames.jsx
// 旧ファイル名: AE_ExportMarkerFrames.jsx（Script_for_AEpanel/06Export_data から移動）
//
// 選択中のレイヤーにあるマーカーのうち、コメントがついているものの
// フレーム数をtxtファイルに書き出す

(function () {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
        alert("アクティブなコンポジションがありません。");
        return;
    }

    var selectedLayers = comp.selectedLayers;
    if (selectedLayers.length === 0) {
        alert("レイヤーを選択してください。");
        return;
    }

    var fps = comp.frameRate;
    var lines = [];

    for (var i = 0; i < selectedLayers.length; i++) {
        var layer = selectedLayers[i];
        var markerProperty = layer.property("ADBE Marker");

        if (!markerProperty) continue;

        var numMarkers = markerProperty.numKeys;
        for (var k = 1; k <= numMarkers; k++) {
            var markerValue = markerProperty.keyValue(k);
            var comment = markerValue.comment;

            // コメントがついているマーカーのみ対象
            if (comment && comment !== "") {
                var timeInSeconds = markerProperty.keyTime(k);
                var frame = Math.round(timeInSeconds * fps);
                lines.push(frame);
            }
        }
    }

    if (lines.length === 0) {
        alert("コメント付きマーカーが見つかりませんでした。");
        return;
    }

    // 保存先を選択
    var saveFile = File.saveDialog("フレーム数の書き出し先を選択", "*.txt");
    if (!saveFile) return;

    saveFile.encoding = "UTF-8";
    saveFile.open("w");
    saveFile.write(lines.join("\n"));
    saveFile.close();

    alert("書き出し完了！\n" + lines.length + "個のマーカーを書き出しました。\n" + saveFile.fsName);
})();
