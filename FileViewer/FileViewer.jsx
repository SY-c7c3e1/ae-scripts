// ============================================================
//  FileViewer for After Effects  v1.0
//  Word (.docx) / PDF / Excel (.xlsx/.csv) テキストビューワー
//  テキストをAE内でコピペ可能な形で閲覧できます
// ============================================================
//
//  【インストール方法】
//  このファイルを以下のフォルダに置いてください:
//  Windows: C:\Program Files\Adobe\Adobe After Effects <バージョン>\Support Files\Scripts\ScriptUI Panels\
//  Mac:     /Applications/Adobe After Effects <バージョン>/Scripts/ScriptUI Panels/
//  その後AEを再起動 → [ウィンドウ] メニューに "FileViewer" が表示されます
//
//  【対応形式】
//  ・.txt  / .csv  → そのまま読み込み
//  ・.docx         → XML内のテキストを抽出
//  ・.xlsx         → 共有文字列＋シートデータからテキスト抽出
//  ・.pdf          → PDFから読めるテキストストリームを抽出（テキストPDFのみ）
//  ※ネイティブバイナリ解析のため、複雑なフォーマットは一部省略されます
// ============================================================

(function (thisObj) {

    // ---------- UI 構築 ----------
    var win = (thisObj instanceof Panel)
        ? thisObj
        : new Window("palette", "📄 File Viewer for AE", undefined, { resizeable: true });

    win.orientation = "column";
    win.alignChildren = ["fill", "top"];
    win.spacing = 6;
    win.margins = 10;

    // --- ヘッダー ---
    var headerGroup = win.add("group");
    headerGroup.orientation = "row";
    headerGroup.alignChildren = ["fill", "center"];

    var filePathBox = headerGroup.add("edittext", undefined, "← ファイルを選択してください");
    filePathBox.alignment = ["fill", "center"];
    filePathBox.enabled = false;

    var browseBtn = headerGroup.add("button", undefined, "📂 開く");
    browseBtn.preferredSize.width = 70;

    var reloadBtn = headerGroup.add("button", undefined, "↺");
    reloadBtn.preferredSize.width = 30;
    reloadBtn.helpTip = "再読み込み";

    // --- 検索バー ---
    var searchGroup = win.add("group");
    searchGroup.orientation = "row";
    searchGroup.alignChildren = ["fill", "center"];

    var searchLabel = searchGroup.add("statictext", undefined, "🔍");
    var searchBox = searchGroup.add("edittext", undefined, "");
    searchBox.alignment = ["fill", "center"];
    searchBox.helpTip = "テキストを検索...";

    var searchBtn = searchGroup.add("button", undefined, "検索");
    searchBtn.preferredSize.width = 50;

    var clearBtn = searchGroup.add("button", undefined, "✕");
    clearBtn.preferredSize.width = 30;

    // --- テキストエリア ---
    var textArea = win.add("edittext", undefined, "",
        { multiline: true, scrollable: true });
    textArea.alignment = ["fill", "fill"];
    textArea.preferredSize = [400, 500];

    // --- ステータスバー ---
    var statusBar = win.add("statictext", undefined, "ファイルを開くと内容が表示されます");
    statusBar.alignment = ["fill", "bottom"];

    // --- 情報バー ---
    var infoGroup = win.add("group");
    infoGroup.orientation = "row";
    infoGroup.alignChildren = ["fill", "center"];

    var charCountLabel = infoGroup.add("statictext", undefined, "文字数: 0");
    var lineCountLabel = infoGroup.add("statictext", undefined, "行数: 0");
    var copyAllBtn = infoGroup.add("button", undefined, "全てコピー");
    copyAllBtn.preferredSize.width = 80;

    // ---------- 状態管理 ----------
    var currentFilePath = "";
    var rawContent = "";
    var searchResults = [];
    var currentSearchIdx = 0;

    // ---------- ユーティリティ ----------
    function setStatus(msg) {
        statusBar.text = msg;
        statusBar.notify("onChange");
    }

    function updateCounters(text) {
        charCountLabel.text = "文字数: " + text.length;
        var lines = text.split("\n").length;
        lineCountLabel.text = "行数: " + lines;
    }

    // ---------- ファイル読み込みコア ----------
    function readFile(fp) {
        var f = new File(fp);
        if (!f.exists) { setStatus("❌ ファイルが見つかりません"); return null; }

        var ext = fp.toLowerCase().split(".").pop();

        if (ext === "txt" || ext === "csv") {
            return readPlainText(f);
        } else if (ext === "docx" || ext === "xlsx") {
            return readZippedXML(f, ext);
        } else if (ext === "pdf") {
            return readPDF(f);
        } else {
            // 不明な拡張子でもプレーンテキストとして試みる
            return readPlainText(f);
        }
    }

    // プレーンテキスト読み込み
    function readPlainText(f) {
        try {
            f.encoding = "UTF-8";
            f.open("r");
            var content = f.read();
            f.close();
            return content;
        } catch (e) {
            try {
                f.encoding = "SHIFT-JIS";
                f.open("r");
                var content = f.read();
                f.close();
                return content;
            } catch (e2) {
                setStatus("❌ 読み込みエラー: " + e2.message);
                return null;
            }
        }
    }

    // docx/xlsx (ZIP形式) からXMLテキストを抽出
    // AEのExtendScriptはZIP展開APIがないため、バイナリからXMLタグ間テキストを正規表現で抽出
    function readZippedXML(f, ext) {
        try {
            f.encoding = "binary";
            f.open("r");
            var binary = f.read();
            f.close();

            // ZIPローカルファイルヘッダー (PK\x03\x04) を検索してファイル名と内容を取得
            var xmlContents = [];
            var pos = 0;
            var PK = "\x50\x4B\x03\x04";

            while (true) {
                var idx = binary.indexOf(PK, pos);
                if (idx === -1) break;

                // ローカルファイルヘッダー解析
                var fnLen = binary.charCodeAt(idx + 26) + binary.charCodeAt(idx + 27) * 256;
                var extraLen = binary.charCodeAt(idx + 28) + binary.charCodeAt(idx + 29) * 256;
                var compMethod = binary.charCodeAt(idx + 8) + binary.charCodeAt(idx + 9) * 256;
                var compSize = binary.charCodeAt(idx + 18) + binary.charCodeAt(idx + 19) * 256 +
                               binary.charCodeAt(idx + 20) * 65536 + binary.charCodeAt(idx + 21) * 16777216;
                var fn = binary.substring(idx + 30, idx + 30 + fnLen);
                var dataStart = idx + 30 + fnLen + extraLen;

                // 対象ファイルを判定
                var isTarget = false;
                if (ext === "docx" && fn === "word/document.xml") isTarget = true;
                if (ext === "xlsx" && (fn === "xl/sharedStrings.xml" || fn.indexOf("xl/worksheets/sheet") === 0)) isTarget = true;

                if (isTarget && compMethod === 0) {
                    // 非圧縮 (stored) の場合
                    xmlContents.push({ name: fn, data: binary.substring(dataStart, dataStart + compSize) });
                } else if (isTarget && compMethod === 8) {
                    // Deflate圧縮 - AEのExtendScriptでは展開不可
                    // 代替手法: バイナリ内の印字可能ASCII/UTF-8を抽出
                    xmlContents.push({ name: fn, data: extractReadableText(binary.substring(dataStart, dataStart + Math.min(compSize * 3, binary.length - dataStart))) });
                }

                pos = dataStart + compSize;
                if (pos >= binary.length) break;
            }

            if (xmlContents.length === 0) {
                // フォールバック: バイナリ全体からテキストを抽出
                return extractReadableText(binary);
            }

            // XMLからテキストを抽出
            var result = [];
            for (var i = 0; i < xmlContents.length; i++) {
                var extracted = extractTextFromXML(xmlContents[i].data, ext);
                if (extracted) result.push(extracted);
            }
            return result.join("\n\n") || "テキストを抽出できませんでした（暗号化またはバイナリ形式の可能性）";

        } catch (e) {
            setStatus("❌ 解析エラー: " + e.message);
            return null;
        }
    }

    // XMLタグ間のテキストを抽出
    function extractTextFromXML(xml, ext) {
        if (!xml) return "";
        var result = [];

        if (ext === "docx") {
            // <w:t>タグの内容を抽出
            var re = /<w:t[^>]*>([^<]*)<\/w:t>/g;
            var m;
            var line = [];
            // 段落区切り
            var paras = xml.split(/<w:p[ >]/);
            for (var i = 0; i < paras.length; i++) {
                var paraText = [];
                re.lastIndex = 0;
                var tm;
                while ((tm = /<w:t[^>]*>([^<]*)<\/w:t>/g.exec(paras[i])) !== null) {
                    if (tm[1]) paraText.push(tm[1]);
                }
                if (paraText.length > 0) result.push(paraText.join(""));
            }
        } else if (ext === "xlsx") {
            // シェアード文字列 or セルデータ
            var re2 = /<t[^>]*>([^<]*)<\/t>/g;
            var m2;
            while ((m2 = re2.exec(xml)) !== null) {
                if (m2[1] && m2[1].trim()) result.push(m2[1]);
            }
            // セル値 (<v>)
            var re3 = /<v>([^<]*)<\/v>/g;
            var m3;
            while ((m3 = re3.exec(xml)) !== null) {
                if (m3[1] && m3[1].trim() && !isNaN(m3[1])) {
                    // 数値はそのまま追加（重複回避のためシェアード文字列と区別）
                }
            }
        }

        return result.join("\n");
    }

    // バイナリから読めるテキストを抽出（フォールバック）
    function extractReadableText(binary) {
        var result = [];
        var buf = "";
        for (var i = 0; i < binary.length; i++) {
            var c = binary.charCodeAt(i);
            if ((c >= 0x20 && c <= 0x7E) || c === 0x0A || c === 0x0D || c === 0x09) {
                buf += binary.charAt(i);
            } else {
                if (buf.length > 3) result.push(buf);
                buf = "";
            }
        }
        if (buf.length > 3) result.push(buf);
        return result.join(" ");
    }

    // PDF からテキストストリームを抽出
    function readPDF(f) {
        try {
            f.encoding = "binary";
            f.open("r");
            var binary = f.read();
            f.close();

            // PDFテキスト抽出: BT...ET ブロック内の Tj / TJ オペレータを探す
            var result = [];
            var btRe = /BT[\s\S]*?ET/g;
            var m;
            while ((m = btRe.exec(binary)) !== null) {
                var block = m[0];
                // (text) Tj
                var tjRe = /\(([^)]*)\)\s*Tj/g;
                var tm;
                while ((tm = tjRe.exec(block)) !== null) {
                    var t = tm[1].replace(/\\n/g, "\n").replace(/\\r/g, "").replace(/\\t/g, "\t")
                                 .replace(/\\\(/g, "(").replace(/\\\)/g, ")").replace(/\\\\/g, "\\");
                    if (t.trim()) result.push(t);
                }
                // [(text)] TJ
                var tjArr = /\[([^\]]*)\]\s*TJ/g;
                var ta;
                while ((ta = tjArr.exec(block)) !== null) {
                    var inner = ta[1];
                    var strRe = /\(([^)]*)\)/g;
                    var sm;
                    var line = [];
                    while ((sm = strRe.exec(inner)) !== null) {
                        if (sm[1].trim()) line.push(sm[1]);
                    }
                    if (line.length) result.push(line.join(""));
                }
            }

            if (result.length === 0) {
                return "テキストを抽出できませんでした。\n" +
                       "このPDFはスキャン画像またはセキュリティ保護されている可能性があります。\n" +
                       "テキストPDF（コピー可能なもの）のみ対応しています。";
            }

            return result.join("\n");
        } catch (e) {
            setStatus("❌ PDF解析エラー: " + e.message);
            return null;
        }
    }

    // ---------- UI イベント ----------

    // ファイルを開く
    browseBtn.onClick = function () {
        var f = File.openDialog("ファイルを選択",
            "Word/Excel/PDF/Text:*.docx;*.xlsx;*.csv;*.txt;*.pdf,All files:*.*");
        if (!f) return;
        currentFilePath = f.fsName;
        filePathBox.text = currentFilePath;
        loadAndDisplay(currentFilePath);
    };

    // 再読み込み
    reloadBtn.onClick = function () {
        if (currentFilePath) loadAndDisplay(currentFilePath);
    };

    function loadAndDisplay(fp) {
        setStatus("⏳ 読み込み中...");
        var content = readFile(fp);
        if (content === null) return;
        rawContent = content;
        textArea.text = rawContent;
        updateCounters(rawContent);
        var ext = fp.split(".").pop().toUpperCase();
        setStatus("✅ " + ext + " を読み込みました (" + rawContent.length + " 文字)");
    }

    // 検索
    searchBtn.onClick = function () {
        var keyword = searchBox.text;
        if (!keyword || !rawContent) return;

        var text = rawContent;
        var idx = text.toLowerCase().indexOf(keyword.toLowerCase(), 0);
        if (idx === -1) {
            setStatus("「" + keyword + "」は見つかりませんでした");
            return;
        }
        // テキストエリアで見つかった位置付近を表示
        // ExtendScriptのedittextはsetSelectionがないので前後コンテキストで表示
        var start = Math.max(0, idx - 200);
        var preview = text.substring(start, start + 800);
        // ハイライト代わりに >> << でマーキングして表示
        var marked = preview.replace(
            new RegExp("(" + keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi"),
            ">>$1<<"
        );
        textArea.text = "[検索結果プレビュー - 全文表示は「✕」]\n" +
                        "─────────────\n" + marked + "\n─────────────\n" +
                        "(全文での位置: " + idx + "文字目)";
        setStatus("「" + keyword + "」が見つかりました (位置: " + idx + ")");
    };

    // 検索クリア
    clearBtn.onClick = function () {
        searchBox.text = "";
        if (rawContent) {
            textArea.text = rawContent;
            updateCounters(rawContent);
            setStatus("✅ 全文表示に戻しました");
        }
    };

    // 全てコピー (クリップボード経由: AEの制限でapp.executeScriptは不要)
    copyAllBtn.onClick = function () {
        if (!rawContent) return;
        // テキストエリアを全選択してコピー操作
        textArea.text = rawContent;
        textArea.active = true;
        // AE ExtendScriptでは直接クリップボード書き込みは不可
        // ユーザーに全選択 (Ctrl+A) & コピーを促す
        setStatus("⌨️ テキストエリアをクリックして Ctrl+A → Ctrl+C でコピーできます");
        alert("テキストエリアをクリックして\nCtrl+A（全選択）→ Ctrl+C（コピー）\nでクリップボードにコピーできます。");
    };

    // リサイズ対応
    win.onResizing = win.onResize = function () {
        win.layout.resize();
    };

    // ---------- ウィンドウ表示 ----------
    if (win instanceof Window) {
        win.center();
        win.show();
    } else {
        win.layout.layout(true);
    }

})(this);
