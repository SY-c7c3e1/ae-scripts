// GroupsToLayers.core.js
// レイヤー内のグループをグループごとに新規レイヤーへ分離する処理の、
// Illustrator非依存な純粋ロジック部分。
//
// - レイヤー名の重複解決・自動命名
// - 実行順序（背面から処理して、元の前後関係を保ったまま積み直す）の組み立て
// - レイヤーツリーの平坦化（レイヤー選択UI用）
//
// Illustratorオブジェクト（Layer, GroupItem等）への実際のアクセスは
// GroupsToLayers.jsx 側でのみ行う。

(function (global) {
    "use strict";

    // 同名衝突を避けつつレイヤー名を決める。
    // groupName が空文字なら fallbackBase を使い、既に使われていれば " (2)" 等を付与する。
    function resolveLayerName(groupName, fallbackBase, usedNames) {
        var base = (groupName && groupName.length > 0) ? groupName : fallbackBase;
        var name = base;
        var n = 2;
        while (usedNames[name]) {
            name = base + " (" + n + ")";
            n++;
        }
        usedNames[name] = true;
        return name;
    }

    // groups: [{ name: string }] 前面→背面の順（index 0 = 最前面）
    // sourceLayerName: 名前未設定グループのフォールバック名に使う元レイヤー名
    //
    // 戻り値: [{ groupIndex, layerName }] を「実行すべき順序」で並べたもの。
    // 新規レイヤーは毎回「元レイヤーの直前（真上）」に挿入していく想定なので、
    // 背面のグループから先に処理することで、処理後も元の前後関係が保たれる。
    function buildExecutionPlan(groups, sourceLayerName) {
        var usedNames = {};
        var plan = [];

        for (var i = 0; i < groups.length; i++) {
            var humanPosition = i + 1; // 1 = 最前面
            var fallbackBase = sourceLayerName + "_" + humanPosition;
            var layerName = resolveLayerName(groups[i].name, fallbackBase, usedNames);
            plan.push({ groupIndex: i, layerName: layerName });
        }

        plan.reverse(); // 背面から処理する順序に
        return plan;
    }

    // layersCollection: .length と添字アクセス（[i]）を持つ「レイヤーの集合」。
    // 各要素は { name, layers? } を持つ（layers は同じ形の子レイヤー集合、任意）。
    // Illustratorの Layers コレクション／モック双方に対応。
    //
    // 戻り値: [{ layer, name, depth }] をツリー順に平坦化した配列（UIのドロップダウン用）。
    function flattenLayers(layersCollection, depth, out) {
        depth = depth || 0;
        out = out || [];

        for (var i = 0; i < layersCollection.length; i++) {
            var layer = layersCollection[i];
            out.push({ layer: layer, name: layer.name, depth: depth });
            if (layer.layers && layer.layers.length > 0) {
                flattenLayers(layer.layers, depth + 1, out);
            }
        }

        return out;
    }

    // ドロップダウン等の表示用ラベル（階層をインデントで表現）
    function indentLabel(name, depth) {
        var indent = "";
        for (var i = 0; i < depth; i++) {
            indent += "    ";
        }
        return indent + name;
    }

    var ns = {
        resolveLayerName: resolveLayerName,
        buildExecutionPlan: buildExecutionPlan,
        flattenLayers: flattenLayers,
        indentLabel: indentLabel
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = ns; // Node（テストから require）
    } else {
        global.GroupsToLayersCore = ns; // ExtendScript（#include後、グローバルに生える）
    }
})(this);
