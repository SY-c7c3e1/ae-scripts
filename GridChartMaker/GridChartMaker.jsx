// ============================================================
// GridChartMaker.jsx
// After Effects コンポに合わせたグリッドカラーチャートを生成する ScriptUI パネル
// Usage: File > Scripts > Run Script File...  or  ScriptUI Panels フォルダに配置
// ============================================================

(function (thisObj) {

    // ─────────────────────────────────────────────────────────
    //  Utilities
    // ─────────────────────────────────────────────────────────

    /** HSV → RGB (各値 0–1 で返す) */
    function hsvToRgb(h, s, v) {
        h = ((h % 360) + 360) % 360;
        var c = v * s;
        var x = c * (1 - Math.abs((h / 60) % 2 - 1));
        var m = v - c;
        var r = 0, g = 0, b = 0;
        if      (h < 60)  { r = c; g = x; b = 0; }
        else if (h < 120) { r = x; g = c; b = 0; }
        else if (h < 180) { r = 0; g = c; b = x; }
        else if (h < 240) { r = 0; g = x; b = c; }
        else if (h < 300) { r = x; g = 0; b = c; }
        else              { r = c; g = 0; b = x; }
        return [r + m, g + m, b + m];
    }

    /** 列インデックス(0始まり) → Excel列ラベル  0→A, 25→Z, 26→AA */
    function colToLetter(n) {
        var result = "", tmp = n + 1;
        while (tmp > 0) {
            tmp--;
            result = String.fromCharCode(65 + (tmp % 26)) + result;
            tmp = Math.floor(tmp / 26);
        }
        return result;
    }

    function clamp(val, lo, hi) { return Math.max(lo, Math.min(hi, val)); }

    /** 輝度計算 (0–1) */
    function luminance(rgb) {
        return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
    }

    // ─────────────────────────────────────────────────────────
    //  Core: グリッド生成
    // ─────────────────────────────────────────────────────────

    function generateGrid(cfg) {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) {
            alert("アクティブなコンポジションがありません。\nコンポを開いてから実行してください。");
            return false;
        }

        var compW      = comp.width;
        var compH      = comp.height;
        var cols       = cfg.cols;
        var rows       = cfg.rows;
        var cellW      = compW / cols;   // float OK — ピクセル境界は四捨五入
        var cellH      = compH / rows;
        var hueStart   = cfg.hueStart;
        var fontSize   = cfg.fontSize;
        var satTop     = cfg.satTop;     // 0行目(上)の彩度
        var satBottom  = cfg.satBottom;  // 最終行の彩度
        var valTop     = cfg.valTop;     // 0行目の明度
        var valBottom  = cfg.valBottom;  // 最終行の明度
        var precompEach = cfg.precompEach;

        // 警告
        var total = cols * rows;
        if (total > 400 && !confirm(
            total + " セル(" + cols + "×" + rows + ")を生成します。\n" +
            "多い場合は処理に時間がかかります。続けますか？")) {
            return false;
        }

        app.beginUndoGroup("GridChartMaker: Generate");

        try {
            // AE はレイヤーを追加するたびに最上位に積まれる。
            // 視覚的に「左上＝最上段最左列」がわかりやすいよう、
            // 最後の行・列から追加 → A1 が最上位レイヤーになる。

            for (var row = rows - 1; row >= 0; row--) {
                for (var col = cols - 1; col >= 0; col--) {

                    var label = colToLetter(col) + (row + 1);

                    // ── 色計算 ──────────────────────────────────
                    // 列 → 色相（色相環を均等分割）
                    var hue = hueStart + (col / cols) * 360;

                    // 行 → 彩度＋明度（上=高彩度 → 下=低彩度、黒白には近づけない）
                    var t   = (rows > 1) ? row / (rows - 1) : 0; // 0=最上行, 1=最下行
                    var sat = clamp(satTop + t * (satBottom - satTop), 0.40, 0.98);
                    var val = clamp(valTop + t * (valBottom - valTop), 0.50, 0.95);
                    var rgb = hsvToRgb(hue, sat, val);

                    // テキスト色: 背景輝度で白黒自動切替
                    var txtColor = (luminance(rgb) > 0.45) ? [0, 0, 0] : [1, 1, 1];

                    // ── セル位置 ────────────────────────────────
                    var cx = col * cellW + cellW / 2;   // comp座標でのセル中心X
                    var cy = row * cellH + cellH / 2;   // comp座標でのセル中心Y

                    var solidW = Math.round(cellW);
                    var solidH = Math.round(cellH);

                    if (precompEach) {
                        // ── プリコンプモード ─────────────────────
                        var cellComp = app.project.items.addComp(
                            label,
                            solidW, solidH,
                            comp.pixelAspect,
                            comp.duration,
                            comp.frameRate
                        );

                        // 平面
                        var innerSolid = cellComp.layers.addSolid(rgb, label + "_bg", solidW, solidH, 1);
                        innerSolid.position.setValue([solidW / 2, solidH / 2]);

                        // テキスト
                        var innerText = cellComp.layers.addText(label);
                        innerText.name = label;
                        _applyTextStyle(innerText, label, fontSize, txtColor);
                        innerText.position.setValue([solidW / 2, solidH / 2 + fontSize * 0.35]);

                        // プリコンプをメインコンプに配置
                        var cellLayer = comp.layers.add(cellComp);
                        cellLayer.name = label;
                        cellLayer.position.setValue([cx, cy]);

                    } else {
                        // ── フラットモード（平面 + テキストを直置き）──
                        var solid = comp.layers.addSolid(rgb, label, solidW, solidH, 1);
                        solid.position.setValue([cx, cy]);

                        // テキストは固定後に追加（レイヤー順: text > solid）
                        var tLayer = comp.layers.addText(label);
                        tLayer.name = label;
                        _applyTextStyle(tLayer, label, fontSize, txtColor);
                        // point text: position はベースライン位置 → 少し下にずらして視覚的センタリング
                        tLayer.position.setValue([cx, cy + fontSize * 0.35]);
                    }
                }
            }

        } catch (e) {
            app.endUndoGroup();
            alert("エラーが発生しました:\n" + e.toString() + "\n(line: " + e.line + ")");
            return false;
        }

        app.endUndoGroup();
        return true;
    }

    /** テキストスタイルを適用するヘルパー */
    function _applyTextStyle(layer, txt, fontSize, fillColor) {
        var srcText = layer.property("Source Text");
        var td = srcText.value;
        td.resetCharStyle();
        td.fontSize    = fontSize;
        td.fillColor   = fillColor;
        td.strokeWidth = 0;
        td.justification = ParagraphJustification.CENTER_JUSTIFY;
        // フォント: Bold があれば使用、なければスキップ
        try { td.font = "ArialMT"; } catch (e) {}
        try { td.font = "Arial-BoldMT"; } catch (e) {}
        srcText.setValue(td);
    }

    // ─────────────────────────────────────────────────────────
    //  UI
    // ─────────────────────────────────────────────────────────

    var win = (thisObj instanceof Panel)
        ? thisObj
        : new Window("palette", "Grid Chart Maker", undefined, { resizable: true });

    win.orientation  = "column";
    win.alignChildren = ["fill", "top"];
    win.margins  = 12;
    win.spacing  = 6;

    // タイトル
    var title = win.add("statictext", undefined, "Grid Chart Maker");
    title.graphics.font = ScriptUI.newFont("Arial", "BOLD", 13);

    // ══ モード選択 ════════════════════════════════════════════
    var modePanel = win.add("panel", undefined, "分割モード");
    modePanel.orientation  = "row";
    modePanel.alignChildren = ["left", "center"];
    modePanel.margins = [10, 14, 10, 8];
    var rbGrid = modePanel.add("radiobutton", undefined, "列×行を指定");
    var rbCell = modePanel.add("radiobutton", undefined, "セルサイズを指定");
    rbGrid.value = true;

    // ══ グリッド設定 ══════════════════════════════════════════
    var gridPanel = win.add("panel", undefined, "グリッド設定");
    gridPanel.orientation  = "column";
    gridPanel.alignChildren = ["fill", "top"];
    gridPanel.margins = [10, 14, 10, 8];

    function addLabeledInput(parent, labelStr, defVal, w) {
        var g = parent.add("group");
        g.alignChildren = ["left", "center"];
        var lbl = g.add("statictext", [0, 0, 90, 18], labelStr);
        var inp = g.add("edittext",   [0, 0, w || 55, 20], String(defVal));
        return inp;
    }

    var colsInput  = addLabeledInput(gridPanel, "列数 (Cols):",  7);
    var rowsInput  = addLabeledInput(gridPanel, "行数 (Rows):",  6);

    // ══ セルサイズ設定 ════════════════════════════════════════
    var cellPanel = win.add("panel", undefined, "セルサイズ設定");
    cellPanel.orientation  = "column";
    cellPanel.alignChildren = ["fill", "top"];
    cellPanel.margins = [10, 14, 10, 8];
    cellPanel.enabled = false;

    var cellWInput = addLabeledInput(cellPanel, "セル幅 (px):",   200);
    var cellHInput = addLabeledInput(cellPanel, "セル高さ (px):", 120);

    // ══ カラー設定 ════════════════════════════════════════════
    var colorPanel = win.add("panel", undefined, "カラー設定");
    colorPanel.orientation  = "column";
    colorPanel.alignChildren = ["fill", "top"];
    colorPanel.margins = [10, 14, 10, 8];

    var hueInput      = addLabeledInput(colorPanel, "開始色相 (0-360):", 0);
    var satTopInput   = addLabeledInput(colorPanel, "最上行 彩度 (%):",  90);
    var satBotInput   = addLabeledInput(colorPanel, "最下行 彩度 (%):",  50);
    var valTopInput   = addLabeledInput(colorPanel, "最上行 明度 (%):",  85);
    var valBotInput   = addLabeledInput(colorPanel, "最下行 明度 (%):",  70);

    var satHint = colorPanel.add("statictext", undefined,
        "※ 彩度/明度は0%(黒白)にならないよう40-98%に制限されます");
    satHint.graphics.foregroundColor = satHint.graphics.newPen(
        satHint.graphics.PenType.SOLID_COLOR, [0.5, 0.5, 0.5], 1);

    // ══ テキスト設定 ══════════════════════════════════════════
    var textPanel = win.add("panel", undefined, "テキスト設定");
    textPanel.orientation  = "column";
    textPanel.alignChildren = ["fill", "top"];
    textPanel.margins = [10, 14, 10, 8];

    var fontSizeInput = addLabeledInput(textPanel, "フォントサイズ:", 24);

    // ══ オプション ════════════════════════════════════════════
    var optPanel = win.add("panel", undefined, "オプション");
    optPanel.orientation  = "column";
    optPanel.alignChildren = ["fill", "top"];
    optPanel.margins = [10, 14, 10, 8];

    var precompCheck = optPanel.add("checkbox", undefined,
        "各セルをプリコンプ化 (推奨: セル数が少ない場合)");
    precompCheck.value = false;

    // ══ 情報表示 ══════════════════════════════════════════════
    var infoPanel = win.add("panel", undefined, "コンポ情報");
    infoPanel.orientation  = "column";
    infoPanel.alignChildren = ["fill", "top"];
    infoPanel.margins = [10, 14, 10, 8];

    var infoText = infoPanel.add("statictext", undefined, "（未取得）", { multiline: true });
    infoText.preferredSize.height = 40;

    // ══ ボタン ════════════════════════════════════════════════
    var genBtn     = win.add("button", undefined, "▶ グリッドを生成");
    genBtn.preferredSize.height = 32;

    var refreshBtn = win.add("button", undefined, "↺ コンポ情報を更新");

    // ── イベント ──────────────────────────────────────────────

    rbGrid.onClick = function () { gridPanel.enabled = true;  cellPanel.enabled = false; updateInfo(); };
    rbCell.onClick = function () { gridPanel.enabled = false; cellPanel.enabled = true;  updateInfo(); };

    function getGridSize() {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) return null;
        var cols, rows, cw, ch;
        if (rbGrid.value) {
            cols = Math.max(1, parseInt(colsInput.text)  || 7);
            rows = Math.max(1, parseInt(rowsInput.text)  || 6);
            cw   = comp.width  / cols;
            ch   = comp.height / rows;
        } else {
            cw   = Math.max(1, parseFloat(cellWInput.text) || 200);
            ch   = Math.max(1, parseFloat(cellHInput.text) || 120);
            cols = Math.max(1, Math.floor(comp.width  / cw));
            rows = Math.max(1, Math.floor(comp.height / ch));
        }
        return { comp: comp, cols: cols, rows: rows, cellW: cw, cellH: ch };
    }

    function updateInfo() {
        var g = getGridSize();
        if (!g) {
            infoText.text = "コンポジションが選択されていません";
            return;
        }
        infoText.text =
            g.comp.name + "  (" + g.comp.width + " × " + g.comp.height + " px)\n" +
            "→ " + g.cols + " 列 × " + g.rows + " 行   " +
            "セル: " + g.cellW.toFixed(1) + " × " + g.cellH.toFixed(1) + " px" +
            "   合計 " + (g.cols * g.rows) + " セル";
    }

    // 入力変更で情報更新
    var watchInputs = [colsInput, rowsInput, cellWInput, cellHInput];
    for (var i = 0; i < watchInputs.length; i++) {
        watchInputs[i].onChange = updateInfo;
    }

    refreshBtn.onClick = updateInfo;

    genBtn.onClick = function () {
        var g = getGridSize();
        if (!g) { alert("コンポジションが選択されていません。"); return; }

        var ok = generateGrid({
            cols:        g.cols,
            rows:        g.rows,
            hueStart:    parseFloat(hueInput.text)     || 0,
            satTop:      (parseFloat(satTopInput.text) || 90) / 100,
            satBottom:   (parseFloat(satBotInput.text) || 50) / 100,
            valTop:      (parseFloat(valTopInput.text) || 85) / 100,
            valBottom:   (parseFloat(valBotInput.text) || 70) / 100,
            fontSize:    parseFloat(fontSizeInput.text) || 24,
            precompEach: precompCheck.value
        });

        if (ok) {
            alert(
                "完了！\n" +
                g.cols + " 列 × " + g.rows + " 行 = " + (g.cols * g.rows) + " セルを生成しました。\n\n" +
                "レイヤー構造:\n" +
                (precompCheck.value
                    ? "・各セルはプリコンプ（A1, B1, … ）として配置されました"
                    : "・平面レイヤー（A1, B1, …）＋テキストレイヤー（A1, B1, …）として配置されました")
            );
            updateInfo();
        }
    };

    // ─────────────────────────────────────────────────────────
    win.layout.layout(true);
    updateInfo();

    if (win instanceof Window) {
        win.center();
        win.show();
    } else {
        win.layout.resize();
        win.onResizing = win.onResize = function () { win.layout.resize(); };
    }

})(this);
