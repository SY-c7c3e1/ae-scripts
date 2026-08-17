// LoopPrecomp.jsx
// プロジェクトパネルで選択したコンポジションをループ用にプリコンポするスクリプト

(function () {

    var selectedItems = app.project.selection;

    if (!selectedItems || selectedItems.length === 0) {
        alert("プロジェクトパネルでコンポジションを選択してください。");
        return;
    }

    var targetComps = [];
    for (var i = 0; i < selectedItems.length; i++) {
        if (selectedItems[i] instanceof CompItem) {
            targetComps.push(selectedItems[i]);
        }
    }

    if (targetComps.length === 0) {
        alert("選択中のアイテムにコンポジションが含まれていません。");
        return;
    }

    var srcComp   = targetComps[0];
    var fps       = srcComp.frameRate;
    var srcFrames = Math.round(srcComp.duration * fps);

    var input = prompt(
        "ループさせるフレーム数を入力してください。\n" +
        "対象コンポ: " + srcComp.name + "\n" +
        "コンポ尺: " + srcFrames + " f",
        srcFrames
    );

    if (input === null) return;

    var loopFrames = parseInt(input, 10);

    if (isNaN(loopFrames) || loopFrames <= 0) {
        alert("有効なフレーム数を入力してください。");
        return;
    }

    if (loopFrames >= srcFrames) {
        alert("ループ尺はコンポ尺（" + srcFrames + " f）より小さい値にしてください。");
        return;
    }

    var loopDuration = loopFrames / fps;

    app.beginUndoGroup("LoopPrecomp");

    try {
        // Step 1: ループ用プリコンポを新規作成
        var loopComp = app.project.items.addComp(
            srcComp.name + "_loop",
            srcComp.width,
            srcComp.height,
            srcComp.pixelAspect,
            loopDuration,
            fps
        );

        if (srcComp.parentFolder && srcComp.parentFolder !== app.project.rootFolder) {
            loopComp.parentFolder = srcComp.parentFolder;
        }

        // Step 2: 元コンポをレイヤーとして追加
        var baseLayer = loopComp.layers.add(srcComp);
        baseLayer.startTime = 0;

        // Step 3: splitLayer(time) に秒を渡してスプリット
        var tailLayer = baseLayer.splitLayer(loopDuration);
        // tailLayer = スプリット後の後半レイヤー（inPoint = loopDuration）

        // Step 4: 後半レイヤーをコンポの0fに移動
        // startTime を (startTime - inPoint) にすることで inPoint が 0 になる
        tailLayer.startTime = tailLayer.startTime - tailLayer.inPoint;

    } catch (e) {
        app.endUndoGroup();
        alert("エラーが発生しました:\n" + e.toString());
        return;
    }

    app.endUndoGroup();

    alert(
        "完了！\n" +
        "プリコンプ名: " + srcComp.name + "_loop\n" +
        "ループ尺: " + loopFrames + " f\n" +
        "前半レイヤー: 0 〜 " + loopFrames + " f\n" +
        "後半レイヤー: コンポ頭から " + (srcFrames - loopFrames) + " f"
    );

})();
