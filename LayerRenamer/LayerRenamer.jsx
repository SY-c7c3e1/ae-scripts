// LayerRenamer.jsx
// 選択レイヤーの名前を一括変更するツール
//
// 処理内容（この順番で適用される）：
//   1. 「最初から◯文字消す」で先頭を削除
//   2. 「最後から◯文字消す」で末尾を削除
//   3. 「置き換え」で文字列を全置換（正規表現の特殊文字は自動エスケープ）
//   4. 「最初につける」「最後につける」で前後に文字列を追加
//
// ロジック本体は LayerRenamer.core.js に分離している（Node上でのテスト対象はそちら）。

#include "LayerRenamer.core.js"

(function () {

    // ウィンドウオブジェクトの作成
    var winObj = new Window('palette', 'LayerRenamer', undefined, {resizeable:true});

    // メインパネルの設定
    var compSettingPnl = winObj.add('panel', undefined, 'MainPanel');
    compSettingPnl.alignChildren = 'left';

    // UI作成
    compSettingPnl.add("statictext", undefined, "置き換え");
    var beforeReplaceEditText = compSettingPnl.add("edittext", undefined, "");
    beforeReplaceEditText.characters = 15;
    var arrowText = compSettingPnl.add("statictext", undefined, "->");
    arrowText.alignment = "center";
    var afterReplaceEditText = compSettingPnl.add("edittext", undefined, "");
    afterReplaceEditText.characters = 15;

    compSettingPnl.add("statictext", undefined, "最初につける");
    var firstEditText = compSettingPnl.add("edittext", undefined, "");
    firstEditText.characters = 30;

    var firstDelGroup = compSettingPnl.add("group");
    firstDelGroup.add("statictext", undefined, "最初から");
    var firstDelEditText = firstDelGroup.add("edittext", undefined, "0");
    firstDelEditText.characters = 5;
    firstDelGroup.add("statictext", undefined, "文字消す");

    compSettingPnl.add("statictext", undefined, "最後につける");
    var endEditText = compSettingPnl.add("edittext", undefined, "");
    endEditText.characters = 30;

    var endDelGroup = compSettingPnl.add("group");
    endDelGroup.add("statictext", undefined, "最後から");
    var endDelEditText = endDelGroup.add("edittext", undefined, "0");
    endDelEditText.characters = 5;
    endDelGroup.add("statictext", undefined, "文字消す");

    // Renameボタン
    var startBtn = winObj.add("button", undefined, "Rename");

    startBtn.onClick = function() {
        var firstDelNum = parseInt(firstDelEditText.text, 10);
        var endDelNum   = parseInt(endDelEditText.text, 10);
        if (isNaN(firstDelNum)) firstDelNum = 0;
        if (isNaN(endDelNum))   endDelNum   = 0;

        var options = {
            beforeReplaceText: beforeReplaceEditText.text,
            afterReplaceText:  afterReplaceEditText.text,
            firstText:         firstEditText.text,
            endText:           endEditText.text,
            firstDelNum:       firstDelNum,
            endDelNum:         endDelNum
        };

        app.beginUndoGroup("renameLayers");

        // コンポジションと選択レイヤー取得
        var comp = app.project.activeItem;
        if (!(comp instanceof CompItem)) {
            alert("コンポジションをアクティブにしてください。");
            app.endUndoGroup();
            return;
        }

        var selLayers = comp.selectedLayers;
        if (selLayers.length === 0) {
            alert("レイヤーが選択されていません。");
            app.endUndoGroup();
            return;
        }

        for (var i = 0; i < selLayers.length; i++) {
            var layer = selLayers[i];
            layer.name = LayerRenamerCore.renameLayerName(layer.name, options);
        }

        app.endUndoGroup();
    };

    winObj.center();
    winObj.show();

})();
