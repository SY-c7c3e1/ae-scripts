// RandomizeLayerStart.jsx
// 選択レイヤーの開始位置（startTime）を、コンポの長さの中でランダムに散らす。
//
// 使い方：
//   1. コンポを開き、対象レイヤーを1つ以上選択
//   2. 実行すると、選択した各レイヤーの開始位置がコンポ内のランダムなフレームに移動する

(function () {
    function randomizeLayerStartTimes() {
        var comp = app.project.activeItem;

        if (!(comp instanceof CompItem)) {
            alert("コンポジションを選択してください。");
            return;
        }

        var selectedLayers = comp.selectedLayers;

        if (selectedLayers.length === 0) {
            alert("少なくとも一つのレイヤーを選択してください。");
            return;
        }

        app.beginUndoGroup("ランダムな開始時間を設定（フレーム単位）");

        var compDuration = comp.duration;
        var frameRate = comp.frameRate;
        var totalFrames = Math.floor(compDuration * frameRate);

        for (var i = 0; i < selectedLayers.length; i++) {
            var layer = selectedLayers[i];
            var randomFrame = Math.floor(Math.random() * totalFrames);
            var randomStartTime = randomFrame / frameRate;
            layer.startTime = randomStartTime;
        }

        app.endUndoGroup();
    }

    randomizeLayerStartTimes();
})();
