/*
  C7_RevertToOriginalExpression.jsx
  --------------------------------------------------------------
  AE_ExpressionToMatchName系スクリプトで変換したプロパティを、
  コメントとして残してある「元の式」に復元するツール。

  使い方:
  1. 復元したいプロパティ(Expression行)をタイムラインで選択(複数選択可)
  2. このスクリプトを実行

  マーカー行("// --- Original expression (auto-converted) ---" と
  "// --- UI-independent version below ---")の間にある内容を、
  コメントを外して元のエクスプレッションとして書き戻します。
  マーカーが見つからないプロパティはスキップされます(未変換の式には影響しません)。
  --------------------------------------------------------------
*/

(function () {

    var START_MARKER = "// --- Original expression (auto-converted) ---";
    var END_MARKER = "// --- UI-independent version below ---";

    function main() {
        if (!app.project) { alert("プロジェクトが開かれていません。"); return; }
        var comp = app.project.activeItem;
        if (!(comp instanceof CompItem)) {
            alert("アクティブなコンポジションがありません。");
            return;
        }
        var selProps = comp.selectedProperties;
        if (!selProps || selProps.length === 0) {
            alert("復元したいプロパティ(Expression行)を選択してから実行してください。");
            return;
        }

        var reverted = 0;
        var skipped = 0;
        var reportLines = [];

        app.beginUndoGroup("Revert converted expressions to original");
        try {
            for (var i = 0; i < selProps.length; i++) {
                var prop = selProps[i];
                if (prop.propertyType !== PropertyType.PROPERTY || !prop.expressionEnabled) { skipped++; continue; }

                var text = prop.expression;
                var startIdx = text.indexOf(START_MARKER);
                var endIdx = text.indexOf(END_MARKER);
                if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) { skipped++; continue; }

                var between = text.substring(startIdx + START_MARKER.length, endIdx);
                var lines = between.split("\n");
                var originalLines = [];
                for (var l = 0; l < lines.length; l++) {
                    var line = lines[l];
                    // 先頭の "// " を取り除く
                    if (line.indexOf("// ") === 0) {
                        originalLines.push(line.substring(3));
                    } else if (line.replace(/^\s+|\s+$/g, "") === "") {
                        // 空行はそのまま無視(復元テキストの前後の余分な空行対策)
                    } else {
                        originalLines.push(line);
                    }
                }
                var originalText = originalLines.join("\n").replace(/^\s+|\s+$/, "");

                if (originalText === "") { skipped++; continue; }

                try {
                    prop.expression = originalText;
                    reverted++;
                    reportLines.push(prop.name + " -> 復元OK");
                } catch (e) {
                    skipped++;
                    reportLines.push(prop.name + " -> 復元失敗: " + e.toString());
                }
            }
        } finally {
            app.endUndoGroup();
        }

        alert(
            "[c7] 復元完了\n\n" +
            "復元したプロパティ数: " + reverted + "\n" +
            "スキップ(マーカーなし等): " + skipped + "\n\n" +
            reportLines.join("\n")
        );
    }

    main();

})();
