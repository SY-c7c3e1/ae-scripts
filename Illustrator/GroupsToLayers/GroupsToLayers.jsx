// GroupsToLayers.jsx
// グループ→レイヤー分割ツール
//
// 概要：
//   1つのレイヤーの直下にあるオブジェクト（グループ・複合パス・単体パス・
//   テキストなど種類を問わず）を、1個につき1レイヤーへ分割する
//   （Illustrator標準の「レイヤーに分配」とほぼ同じ対象範囲だが、こちらは
//   グループ名を新レイヤー名に流用する命名や、選択中のみ処理するオプションを持つ）。
//
//   新しく作られるレイヤーは元のレイヤーのすぐ上に積まれ、オブジェクト同士の
//   前後関係（重なり順）は分割後も維持される。
//
// 使い方：
//   1. Illustratorでドキュメントを開く
//   2. スクリプトを実行し、対象レイヤーをドロップダウンから選ぶ
//      （サブレイヤーも階層表示で選択できる）
//   3. 必要なら「選択中のオブジェクトのみ処理する」をON
//      （OFFの場合、そのレイヤー直下にある全オブジェクトが対象）
//   4. [実行] を押す
//
// 名前について：
//   グループに名前が付いている場合はその名前を新しいレイヤー名に使う。
//   未設定（空欄）の場合は「元レイヤー名_1」のように自動採番する。
//   名前が重複する場合は末尾に " (2)" のように連番を付けて区別する。
//
// ロジック本体は GroupsToLayers.core.js に分離している（Node上でのテスト対象はそちら）。
// このファイルは、Illustratorオブジェクトへの実際のアクセスとUIのみを担当する。

#include "GroupsToLayers.core.js"

(function () {

    if (app.documents.length === 0) {
        alert("ドキュメントが開かれていません。");
        return;
    }

    var doc = app.activeDocument;

    // ── レイヤー一覧の取得（サブレイヤーも含めて平坦化） ──────────────
    var flatLayers = GroupsToLayersCore.flattenLayers(doc.layers);
    if (flatLayers.length === 0) {
        alert("レイヤーが見つかりません。");
        return;
    }

    // ── UI ──────────────────────────────────────────────────────
    var dlg = new Window("dialog", "Groups to Layers");
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "top"];
    dlg.spacing = 10;
    dlg.margins = [14, 14, 14, 14];

    var secLayer = dlg.add("panel", undefined, "  対象レイヤー");
    secLayer.orientation = "column";
    secLayer.alignChildren = ["fill", "top"];
    secLayer.margins = [10, 14, 10, 10];

    var layerLabels = [];
    for (var i = 0; i < flatLayers.length; i++) {
        layerLabels.push(GroupsToLayersCore.indentLabel(flatLayers[i].name, flatLayers[i].depth));
    }
    var ddLayer = secLayer.add("dropdownlist", undefined, layerLabels);
    ddLayer.preferredSize.width = 260;

    // 現在アクティブなレイヤーをデフォルト選択
    var defaultIndex = 0;
    for (var j = 0; j < flatLayers.length; j++) {
        if (flatLayers[j].layer === doc.activeLayer) {
            defaultIndex = j;
            break;
        }
    }
    ddLayer.selection = defaultIndex;

    var secOpt = dlg.add("panel", undefined, "  オプション");
    secOpt.orientation = "column";
    secOpt.alignChildren = ["fill", "top"];
    secOpt.margins = [10, 14, 10, 10];

    var chkSelectedOnly = secOpt.add("checkbox", undefined, "選択中のオブジェクトのみ処理する（OFF：全オブジェクト）");
    var chkRemoveEmpty  = secOpt.add("checkbox", undefined, "処理後に元レイヤーが空なら削除する");
    chkRemoveEmpty.value = true;

    var btnGroup = dlg.add("group");
    btnGroup.alignment = "right";
    var btnCancel = btnGroup.add("button", undefined, "キャンセル", { name: "cancel" });
    var btnRun    = btnGroup.add("button", undefined, "実行", { name: "ok" });

    btnRun.onClick = function () {
        var targetLayer = flatLayers[ddLayer.selection.index].layer;

        if (targetLayer.locked) {
            alert("対象レイヤーがロックされています。ロックを解除してから実行してください。");
            return;
        }

        var sourceItems = targetLayer.pageItems; // このレイヤー直下のオブジェクト全種類（グループ・複合パス・単体パス・テキストなど）
        var candidates = [];
        for (var g = 0; g < sourceItems.length; g++) {
            var item = sourceItems[g];
            if (chkSelectedOnly.value && !item.selected) {
                continue;
            }
            candidates.push(item);
        }

        if (candidates.length === 0) {
            alert(chkSelectedOnly.value
                ? "選択されているオブジェクトがありません。"
                : "このレイヤーにオブジェクトが見つかりません。");
            return;
        }

        var groupInfos = [];
        for (var k = 0; k < candidates.length; k++) {
            groupInfos.push({ name: candidates[k].name });
        }

        var plan = GroupsToLayersCore.buildExecutionPlan(groupInfos, targetLayer.name);

        for (var p = 0; p < plan.length; p++) {
            var step = plan[p];
            var newLayer = doc.layers.add();
            newLayer.move(targetLayer, ElementPlacement.PLACEBEFORE);
            newLayer.name = step.layerName;
            candidates[step.groupIndex].move(newLayer, ElementPlacement.PLACEATBEGINNING);
        }

        if (chkRemoveEmpty.value
            && targetLayer.pageItems.length === 0
            && targetLayer.layers.length === 0) {
            targetLayer.remove();
        }

        alert(candidates.length + " 個のオブジェクトを、それぞれ新しいレイヤーに分けました。");
        dlg.close();
    };

    btnCancel.onClick = function () {
        dlg.close();
    };

    dlg.show();

})();
