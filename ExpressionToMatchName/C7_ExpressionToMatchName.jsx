/*
  C7_ExpressionToMatchName.jsx
  --------------------------------------------------------------
  by c7 (com.c7.*)

  エクスプレッション内の「表示名」参照(言語依存)を、
  matchName + propIndex 参照(言語非依存)へ一括変換するスクリプト。

  変換前: thisComp.layer("CONTROL").effect("ドロップシャドウ")("不透明度")
  変換後: thisComp.layer("CONTROL")("ADBE Effect Parade")(3)("ADBE Drop Shadow-0002")
          (元の式はコメントとして残します)

  ・エフェクト自体は Effect Parade 内の数値インデックスで指定(同種エフェクトが
    複数あってもmatchNameだけだと区別できないため)
  ・パラメーターはmatchName文字列で指定(Hue/Saturation等、内部が入れ子構造の
    エフェクトで数値インデックスがズレる問題を回避するため)

  【重要】
  ・必ずコピーしたプロジェクトファイルで実行してください。本番ファイルへの直接実行は非推奨です。
  ・実行するAEのUI言語と、エクスプレッションが書かれた言語は一致させてください。
    (日本語で書かれた式を変換するなら、AEも日本語UIで実行する)
  ・処理は1つのUndoグループにまとめてあるので、直後であれば「取り消し」(Ctrl+Z / Cmd+Z)
    で元に戻せます。保存後の復旧は保証されません。
  --------------------------------------------------------------
*/

(function () {

    // ============================================================
    // 設定
    // ============================================================
    var DRY_RUN = false; // 実際に書き換えます(必ずコピーファイルで実行してください)
    var TARGET_SCOPE = "selectedProperties"; // "selectedProperties"(最速・推奨) | "selectedLayers" | "activeComp" | "all"

    // ============================================================
    // ログ(逐次書き込み)
    // ============================================================
    var logFile = null;

    function initLog() {
        try {
            var baseFolder;
            if (app.project.file) {
                // プロジェクトファイルの隣に専用フォルダを作成
                var logsFolder = new Folder(app.project.file.parent.fsName + "/_matchName_logs");
                if (!logsFolder.exists) logsFolder.create();
                baseFolder = logsFolder.fsName;
            } else if (typeof $.fileName !== "undefined" && File($.fileName).parent) {
                // プロジェクト未保存の場合はスクリプトの隣にフォールバック
                baseFolder = File($.fileName).parent.fsName;
            } else {
                baseFolder = Folder.desktop.fsName;
            }
            logFile = new File(baseFolder + "/AE_matchName_debug_log_" + Date.now() + ".txt");
            logFile.encoding = "UTF-8";
            logFile.open("w");
            logFile.writeln("=== c7 / AE Expression -> matchName ログ ===");
            logFile.writeln(new Date().toString());
            logFile.writeln("DRY_RUN: " + DRY_RUN + " / TARGET_SCOPE: " + TARGET_SCOPE);
            logFile.close();
        } catch (e) {
            logFile = null;
        }
    }

    function logAppend(lines) {
        if (!logFile) return;
        try {
            logFile.open("a");
            for (var i = 0; i < lines.length; i++) {
                logFile.writeln(lines[i]);
            }
            logFile.close();
        } catch (e) {
            // ログ書き込み失敗は無視して処理継続
        }
    }

    // ============================================================
    // ユーティリティ
    // ============================================================
    function trimStr(s) {
        return s.replace(/^\s+|\s+$/g, "");
    }

    function findCompByName(name) {
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === name) return item;
        }
        return null;
    }

    function safeGetLayerByName(comp, layerName) {
        if (!comp) return null;
        try { return comp.layer(layerName); } catch (e) { return null; }
    }

    function safeGetLayerByIndex(comp, index) {
        if (!comp) return null;
        try { return comp.layer(index); } catch (e) { return null; }
    }

    // Property から親をたどって、そのプロパティが属するレイヤーを取得する
    function getOwningLayer(prop) {
        var cur = prop;
        var guard = 0;
        while (cur && cur.parentProperty && guard < 200) {
            cur = cur.parentProperty;
            guard++;
        }
        return cur; // Layer (parentPropertyがnullになった時点のオブジェクト)
    }

    function resolveLayerRef(prefixText, currentComp, currentLayer) {
        if (!prefixText) return currentLayer;
        var p = trimStr(prefixText);
        if (p.charAt(p.length - 1) === ".") p = p.substring(0, p.length - 1);
        p = trimStr(p);
        if (p === "thisLayer") return currentLayer;

        var m;
        m = p.match(/^thisComp\.layer\(\s*"([^"]+)"\s*\)$/) || p.match(/^thisComp\.layer\(\s*'([^']+)'\s*\)$/);
        if (m) return safeGetLayerByName(currentComp, m[1]);
        m = p.match(/^thisComp\.layer\(\s*(\d+)\s*\)$/);
        if (m) return safeGetLayerByIndex(currentComp, parseInt(m[1], 10));
        m = p.match(/^layer\(\s*"([^"]+)"\s*\)$/) || p.match(/^layer\(\s*'([^']+)'\s*\)$/);
        if (m) return safeGetLayerByName(currentComp, m[1]);
        m = p.match(/^layer\(\s*(\d+)\s*\)$/);
        if (m) return safeGetLayerByIndex(currentComp, parseInt(m[1], 10));
        m = p.match(/^comp\(\s*"([^"]+)"\s*\)\.layer\(\s*"([^"]+)"\s*\)$/);
        if (m) { var tc = findCompByName(m[1]); return safeGetLayerByName(tc, m[2]); }
        m = p.match(/^comp\(\s*"([^"]+)"\s*\)\.layer\(\s*(\d+)\s*\)$/);
        if (m) { var tc2 = findCompByName(m[1]); return safeGetLayerByIndex(tc2, parseInt(m[2], 10)); }

        return null;
    }

    function resolveEffectParam(targetLayer, effectDisplayName, paramDisplayName) {
        if (!targetLayer) return null;
        var effectsGroup;
        try { effectsGroup = targetLayer.property("ADBE Effect Parade"); } catch (e) { return null; }
        if (!effectsGroup) return null;

        var effectProp;
        try { effectProp = effectsGroup.property(effectDisplayName); } catch (e) { return null; }
        if (!effectProp) return null;

        var result = { matchName: effectProp.matchName, effectIndex: effectProp.propertyIndex, propIndex: null, paramMatchName: null };

        if (paramDisplayName != null) {
            var paramProp;
            try { paramProp = effectProp.property(paramDisplayName); } catch (e) { return null; }
            if (!paramProp) return null;
            result.propIndex = paramProp.propertyIndex;
            result.paramMatchName = paramProp.matchName; // Hue/Saturation等の入れ子構造対策でこちらを使う
        }
        return result;
    }

    var LAYER_REF_GROUP =
        '(?:thisComp\\.layer\\([^()]*\\)|comp\\([^()]*\\)\\.layer\\([^()]*\\)|layer\\([^()]*\\)|thisLayer)\\s*\\.\\s*';
    var PATTERN_STRING_PARAM = new RegExp('(' + LAYER_REF_GROUP + ')?effect\\(\\s*"([^"]+)"\\s*\\)\\(\\s*"([^"]+)"\\s*\\)', 'g');
    var PATTERN_NUMERIC_PARAM = new RegExp('(' + LAYER_REF_GROUP + ')?effect\\(\\s*"([^"]+)"\\s*\\)\\(\\s*(\\d+)\\s*\\)', 'g');

    function convertExpressionText(exprText, currentComp, currentLayer) {
        var hits = 0;
        var misses = [];

        function replacerStringParam(full, prefix, effectName, paramName) {
            logAppend(["    [checkpoint] layer解決開始: prefix=" + prefix + " effect=" + effectName + " param=" + paramName]);
            var targetLayer = resolveLayerRef(prefix, currentComp, currentLayer);
            logAppend(["    [checkpoint] layer解決完了: " + (targetLayer ? targetLayer.name : "null")]);
            var resolved = resolveEffectParam(targetLayer, effectName, paramName);
            logAppend(["    [checkpoint] effect/param解決完了: effectIndex=" + (resolved ? resolved.effectIndex : "-") + " / paramMatchName=" + (resolved ? resolved.paramMatchName : "null(未解決)")]);
            if (!resolved) { misses.push(full); return full; }
            hits++;
            var prefixOut = prefix ? trimStr(prefix).replace(/\.$/, "") : "thisLayer";
            return prefixOut + '("ADBE Effect Parade")(' + resolved.effectIndex + ')("' + resolved.paramMatchName + '")';
        }

        function replacerNumericParam(full, prefix, effectName, paramIndex) {
            logAppend(["    [checkpoint] (numeric) layer解決開始: prefix=" + prefix + " effect=" + effectName]);
            var targetLayer = resolveLayerRef(prefix, currentComp, currentLayer);
            logAppend(["    [checkpoint] (numeric) layer解決完了: " + (targetLayer ? targetLayer.name : "null")]);
            var resolved = resolveEffectParam(targetLayer, effectName, null);
            logAppend(["    [checkpoint] (numeric) effect解決完了: effectIndex=" + (resolved ? resolved.effectIndex : "null(未解決)")]);
            if (!resolved) { misses.push(full); return full; }
            hits++;
            var prefixOut = prefix ? trimStr(prefix).replace(/\.$/, "") : "thisLayer";
            return prefixOut + '("ADBE Effect Parade")(' + resolved.effectIndex + ')(' + paramIndex + ')';
        }

        logAppend(["  [checkpoint] convertExpressionText開始"]);
        var out = exprText;
        if (out.indexOf("effect(") !== -1) {
            out = out.replace(PATTERN_STRING_PARAM, replacerStringParam);
            logAppend(["  [checkpoint] PATTERN_STRING_PARAM 置換完了"]);
        } else {
            logAppend(["  [checkpoint] 'effect(' なし -> STRING_PARAMスキップ"]);
        }
        if (out.indexOf("effect(") !== -1) {
            out = out.replace(PATTERN_NUMERIC_PARAM, replacerNumericParam);
            logAppend(["  [checkpoint] PATTERN_NUMERIC_PARAM 置換完了"]);
        } else {
            logAppend(["  [checkpoint] 'effect(' なし -> NUMERIC_PARAMスキップ"]);
        }
        return { text: out, hits: hits, misses: misses };
    }

    function walkProperties(propGroup, currentComp, currentLayer, callback) {
        for (var i = 1; i <= propGroup.numProperties; i++) {
            var prop;
            try { prop = propGroup.property(i); } catch (e) { continue; }
            if (!prop) continue;

            if (prop.propertyType === PropertyType.PROPERTY) {
                if (prop.expressionEnabled && prop.expression && trimStr(prop.expression) !== "") {
                    callback(prop, currentComp, currentLayer);
                }
            } else {
                walkProperties(prop, currentComp, currentLayer, callback);
            }
        }
    }

    // ============================================================
    // 1件のプロパティを処理(共通処理)
    // ============================================================
    function processOneProperty(prop, currentComp, currentLayer, logLines, counters) {
        var original = prop.expression;
        var result = convertExpressionText(original, currentComp, currentLayer);
        if (result.hits === 0 && result.misses.length === 0) return;

        counters.totalHits += result.hits;
        counters.totalMisses += result.misses.length;
        var label = "    [" + currentLayer.name + " / " + prop.name + "]";

        if (result.hits > 0) {
            counters.changedProps++;
            logLines.push(label + " " + result.hits + "件 変換対象" + (DRY_RUN ? "(判定のみ)" : ""));
            if (!DRY_RUN) {
                var commented = "// --- Original expression (auto-converted) ---\n";
                var lines = original.split("\n");
                for (var l2 = 0; l2 < lines.length; l2++) commented += "// " + lines[l2] + "\n";
                commented += "// --- UI-independent version below ---\n";
                try { prop.expression = commented + result.text; }
                catch (e) { logLines.push("      !! 書き込み失敗: " + e.toString()); }
            }
        }
        if (result.misses.length > 0) {
            logLines.push(label + " " + result.misses.length + "件 未解決:");
            for (var mi = 0; mi < result.misses.length; mi++) logLines.push("      - " + result.misses[mi]);
        }
    }

    // ============================================================
    // メイン処理
    // ============================================================
    function main() {
        if (!app.project) { alert("プロジェクトが開かれていません。"); return; }

        var counters = { totalHits: 0, totalMisses: 0, changedProps: 0 };

        // ------------------------------------------------------
        // "selectedProperties": 選択中のプロパティを直接処理(最速・走査なし)
        // ------------------------------------------------------
        if (TARGET_SCOPE === "selectedProperties") {
            var activeC = app.project.activeItem;
            if (!(activeC instanceof CompItem)) {
                alert("アクティブなコンポジションがありません。タイムラインでコンプを開いてください。");
                return;
            }
            var selProps = activeC.selectedProperties;
            var targetProps = [];
            if (selProps) {
                for (var sp = 0; sp < selProps.length; sp++) {
                    var p = selProps[sp];
                    if (p.propertyType === PropertyType.PROPERTY && p.expressionEnabled && p.expression && trimStr(p.expression) !== "") {
                        targetProps.push(p);
                    }
                }
            }
            if (targetProps.length === 0) {
                alert(
                    "対象のプロパティが選択されていません。\n\n" +
                    "タイムラインで「Expression: ○○」の行(エクスプレッションが設定されているプロパティ)を" +
                    "クリックして選択してから実行してください。複数選択も可能です。"
                );
                return;
            }

            var proceed1 = confirm(
                "【c7 ExpressionToMatchName・DRY_RUN=" + DRY_RUN + "】\n" +
                "対象: selectedProperties(" + targetProps.length + "件)\n\n" +
                (DRY_RUN ? "実際の書き換えは行いません(判定・ログ出力のみ)。" : "※実際に書き換えます。") + "\n\n" +
                "続行しますか？"
            );
            if (!proceed1) return;

            initLog();
            if (!DRY_RUN) app.beginUndoGroup("Convert expressions to matchName references (debug)");

            try {
                for (var tp = 0; tp < targetProps.length; tp++) {
                    var prop2 = targetProps[tp];
                    var preLogLine = "[" + (tp + 1) + "/" + targetProps.length + "] 処理開始: prop.name=" + prop2.name;
                    try { preLogLine += " / expression(先頭80文字)=" + prop2.expression.substring(0, 80); } catch (eee) {}
                    logAppend([preLogLine]);

                    var owningLayer = getOwningLayer(prop2);
                    logAppend(["  -> owningLayer取得OK: " + owningLayer.name]);

                    var logLines2 = ["  -- 変換処理開始 --"];
                    processOneProperty(prop2, activeC, owningLayer, logLines2, counters);
                    logLines2.push("  -- 変換処理完了 --");
                    logAppend(logLines2);
                }
            } finally {
                if (!DRY_RUN) app.endUndoGroup();
            }

            finish();
            return;
        }

        // ------------------------------------------------------
        // それ以外のスコープ: レイヤー単位で走査(従来どおり)
        // ------------------------------------------------------
        var targetPairs = []; // [{comp, layer}, ...]

        if (TARGET_SCOPE === "selectedLayers") {
            var activeSel = app.project.activeItem;
            if (!(activeSel instanceof CompItem)) {
                alert("アクティブなコンポジションがありません。対象レイヤーを選択した状態のコンプを開いてください。");
                return;
            }
            var selectedLayers = activeSel.selectedLayers;
            if (!selectedLayers || selectedLayers.length === 0) {
                alert("レイヤーが選択されていません。タイムラインで対象レイヤーを選択してから実行してください。");
                return;
            }
            for (var s = 0; s < selectedLayers.length; s++) {
                targetPairs.push({ comp: activeSel, layer: selectedLayers[s] });
            }
        } else if (TARGET_SCOPE === "activeComp") {
            var active = app.project.activeItem;
            if (!(active instanceof CompItem)) {
                alert("アクティブなコンポジションがありません。タイムラインでコンプを開いた状態で実行してください。");
                return;
            }
            for (var li0 = 1; li0 <= active.numLayers; li0++) {
                targetPairs.push({ comp: active, layer: active.layer(li0) });
            }
        } else {
            for (var i = 1; i <= app.project.numItems; i++) {
                var item = app.project.item(i);
                if (item instanceof CompItem) {
                    for (var li1 = 1; li1 <= item.numLayers; li1++) {
                        targetPairs.push({ comp: item, layer: item.layer(li1) });
                    }
                }
            }
        }

        var proceed = confirm(
            "【c7 ExpressionToMatchName・DRY_RUN=" + DRY_RUN + "】\n" +
            "対象: " + TARGET_SCOPE + "(" + targetPairs.length + "レイヤー)\n\n" +
            (DRY_RUN ? "実際の書き換えは行いません(判定・ログ出力のみ)。" : "※実際に書き換えます。") + "\n\n" +
            "続行しますか？"
        );
        if (!proceed) return;

        initLog();
        if (!DRY_RUN) app.beginUndoGroup("Convert expressions to matchName references (debug)");

        try {
            for (var pi = 0; pi < targetPairs.length; pi++) {
                var comp = targetPairs[pi].comp;
                var layer = targetPairs[pi].layer;
                var layerLogLines = ["", "--- [" + (pi + 1) + "/" + targetPairs.length + "] Comp: " + comp.name + " / Layer: " + layer.name + " ... 走査開始 ---"];

                walkProperties(layer, comp, layer, function (prop, currentComp, currentLayer) {
                    processOneProperty(prop, currentComp, currentLayer, layerLogLines, counters);
                });

                layerLogLines.push("--- [" + (pi + 1) + "/" + targetPairs.length + "] " + layer.name + " ... 完了 ---");
                logAppend(layerLogLines);
            }
        } finally {
            if (!DRY_RUN) app.endUndoGroup();
        }

        finish();

        function finish() {
            logAppend(["", "=== サマリー ===",
                "変換対象プロパティ数: " + counters.changedProps,
                "変換対象の参照総数: " + counters.totalHits,
                "未解決の参照総数: " + counters.totalMisses]);

            alert(
                "[c7] 完了しました。\n\n" +
                "変換対象プロパティ数: " + counters.changedProps + "\n" +
                "変換対象の参照総数: " + counters.totalHits + "\n" +
                "未解決の参照総数: " + counters.totalMisses + "\n\n" +
                (logFile ? "ログ: " + logFile.fsName : "(ログ書き込み失敗)")
            );
        }
    }

    main();

})();
