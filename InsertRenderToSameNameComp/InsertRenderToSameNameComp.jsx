/*
  Put Rendered Footage into Same-Named Comps (Ignore Extension + Solo)
  - フッテージ名の拡張子を除いてコンポ名と比較
  - 日本語OK
  - 最上段に追加 or 置換
  - そのレイヤーだけ Solo ON（※無効レイヤーはSolo操作しない）
*/

(function () {

    function isCompItem(it) {
        return it && (it instanceof CompItem);
    }

    function isAddableItem(it) {
        return it && ((it instanceof FootageItem) || (it instanceof CompItem));
    }

    function stripExtension(name) {
        var idx = name.lastIndexOf(".");
        if (idx > 0) return name.substring(0, idx);
        return name;
    }

    function collectAllComps() {
        var map = {};
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (isCompItem(it)) {
                var key = stripExtension(it.name);
                if (!map[key]) map[key] = [];
                map[key].push(it);
            }
        }
        return map;
    }

    function findLayerByBaseName(comp, baseName) {
        for (var i = 1; i <= comp.numLayers; i++) {
            var lyr = comp.layer(i);
            if (stripExtension(lyr.name) === baseName) return lyr;
        }
        return null;
    }

    // ★ここが修正ポイント：無効レイヤーはsolo操作しない（try/catchも保険）
    function soloOnlyThisLayer(comp, layerToSolo) {
        for (var i = 1; i <= comp.numLayers; i++) {
            var lyr = comp.layer(i);
            try {
                if (lyr.enabled) lyr.solo = false;
            } catch (e) {}
        }
        try {
            if (layerToSolo.enabled) layerToSolo.solo = true;
        } catch (e2) {}
    }

    function addOrReplaceTop(comp, srcItem) {
        var baseName = stripExtension(srcItem.name);
        var layer = findLayerByBaseName(comp, baseName);

        if (layer) {
            try {
                layer.replaceSource(srcItem, false);
            } catch (e) {
                layer = null;
            }
        }

        if (!layer) {
            layer = comp.layers.add(srcItem);
        }

        layer.moveToBeginning();
        layer.name = baseName;

        soloOnlyThisLayer(comp, layer);
    }

    function main() {
        if (!app.project) {
            alert("プロジェクトが開かれていません。");
            return;
        }

        var sel = app.project.selection;
        if (!sel || sel.length === 0) {
            alert("プロジェクトパネルでフッテージを選択してください。");
            return;
        }

        var compMap = collectAllComps();
        var log = [];

        app.beginUndoGroup("Put Footage Into Same-Named Comps (Ignore Extension + Solo)");

        for (var i = 0; i < sel.length; i++) {
            var item = sel[i];

            if (!isAddableItem(item)) {
                log.push("SKIP : " + item.name);
                continue;
            }

            var baseName = stripExtension(item.name);
            var comps = compMap[baseName];

            if (!comps || comps.length === 0) {
                log.push("NG   : 同名コンポなし → " + baseName);
                continue;
            }

            for (var c = 0; c < comps.length; c++) {
                addOrReplaceTop(comps[c], item);
            }

            if (comps.length > 1) {
                log.push("WARN : 同名コンポ複数 → " + baseName + " (" + comps.length + ")");
            } else {
                log.push("OK   : " + baseName);
            }
        }

        app.endUndoGroup();

        alert("完了\n\n" + log.join("\n"));
    }

    main();

})();
