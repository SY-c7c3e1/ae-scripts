// LoopComp.jsx
// 選択中のコンポを、指定フレーム数を1周期としてTime Remapでループ複製した
// 新しいコンポ（"元の名前_lp"）を作成する。
//
// 使い方：
//   1. プロジェクトパネルでコンポを1つ選択
//   2. 実行し、ループ1周期の長さ（フレーム数）を入力
//   3. 元コンポの長さに収まる分だけループを複製した新コンポが作られる

(function () {
    function promptUserForLoopFrames(fps) {
        var frameCountStr = prompt("ループ1周期の長さ（フレーム数）を入力してください：", "60");
        if (!frameCountStr) return null;
        var frames = parseInt(frameCountStr, 10);
        if (isNaN(frames) || frames <= 0) {
            alert("有効なフレーム数を入力してください。");
            return null;
        }
        return frames;
    }

    function createLoopComp(originalComp, loopFrames) {
        var fps = originalComp.frameRate;
        var loopDuration = loopFrames / fps;
        var originalDuration = originalComp.duration;

        var loopCount = Math.floor(originalDuration / loopDuration);
        if (loopCount < 1) {
            alert("元コンポが短すぎてループできません。");
            return;
        }

        var newCompName = originalComp.name + "_lp";
        var newComp = app.project.items.addComp(
            newCompName,
            originalComp.width,
            originalComp.height,
            originalComp.pixelAspect,
            loopDuration,
            fps
        );

        for (var i = 0; i < loopCount; i++) {
            var layer = newComp.layers.add(originalComp);
            layer.name = "Loop_" + i;
            layer.startTime = 0;                    // 全レイヤーをコンポ頭に配置
            layer.inPoint = 0;
            layer.outPoint = loopDuration;
            layer.source.startTime = originalComp.startTime; // 念のため
            layer.timeRemapEnabled = true;

            // Time Remapで元の時間をずらす
            var startTime = i * loopDuration;
            layer.timeRemap.setValueAtTime(0, startTime);
            layer.timeRemap.setValueAtTime(loopDuration, startTime + loopDuration);
        }
    }

    app.beginUndoGroup("ループ複製コンポ作成");

    var selectedItems = app.project.selection;
    if (selectedItems.length !== 1 || !(selectedItems[0] instanceof CompItem)) {
        alert("1つのコンポジションを選択してください。");
    } else {
        var comp = selectedItems[0];
        var fps = comp.frameRate;
        var loopFrames = promptUserForLoopFrames(fps);
        if (loopFrames !== null) {
            createLoopComp(comp, loopFrames);
        }
    }

    app.endUndoGroup();
})();
