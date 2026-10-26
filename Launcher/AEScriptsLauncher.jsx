// AEScriptsLauncher.jsx
// ae-scripts ランチャーパネル（v2）
//
// セットアップ：
//   1. Launcher/AEScriptsLauncher_Loader.jsx を「AEScriptsLauncher.jsx」という名前で
//      AE の `Support Files/Scripts/ScriptUI Panels/` フォルダに置き、AEを再起動する
//      （ローダーがこのファイルを毎回読み込むので、ランチャーの改修はリポジトリ側を
//       更新するだけで反映される。このファイル自体を直接置いても動く）
//   2. AEのメニュー：Window > AEScriptsLauncher.jsx を選ぶとパネルとして開く
//      （他のパネルと同様にドッキング可能）
//   3. 初回のみ「設定…」→「フォルダを追加…」で、この ae-scripts リポジトリの
//      ルートフォルダ（package.json がある場所）を指定する
//      → 次回以降はAEの設定に保存されるので選び直し不要
//
// 使い方：
//   ・上のドロップダウンでカテゴリを選ぶと、そのカテゴリのスクリプトが
//     「何をするか」の短い説明つきボタンで並ぶ。押すとその場で実行される。
//   ・先頭の3つは自動で作られるカテゴリ：
//       ★ よく使う     … 起動回数の多い順（上位12個）
//       立ち上げ時      … プロジェクトを開いたら最初に使うもの（categories.json の startup）
//       最近追加・更新  … 7日以内に追加・更新したスクリプト（新しく作ったものをすぐ試す用）
//   ・各カテゴリの中も、よく使うものほど上に並ぶ
//   ・検索欄に名前の一部を入れると、全カテゴリから絞り込む
//   ・他人製のフォルダから見つかったスクリプトには、右側に小さなグレーの●がつく
//   ・Ctrl を押しながらボタンを押すと、実行せずにそのファイルのフォルダを開く
//   ・スクリプトを追加・更新したら「再スキャン」を押すだけで反映される
//     （実行のたびにファイルを読み直すので、AEの再起動は不要）
//
// 複数フォルダ対応：
//   ae-scripts リポジトリ本体（git管理・Public）以外に、他の人が作った
//   スクリプトを置いたフォルダ（例：Scripts/(C7_ThirdParty)、ScriptUI Panels）
//   も「設定…」から登録できる。「他人製」にチェックしたフォルダは
//   ・直下に置かれたファイルも拾う（ScriptUI Panels のような置き方用）
//   ・ボタンに他人製の目印（●）がつく
//   「()」で囲んだフォルダはAEの慣習どおりスキャンしない。
//
// 設定ファイル：
//   各フォルダの Launcher/categories.json と、フォルダ直下の launcher.json を
//   すべて読み込んでまとめる（項目の説明は Launcher.core.js の先頭）。
//   最後に Folder.userData/C7_AEScriptsLauncher/launcher.json（個人設定）を読み、
//   これが一番優先される。他人製スクリプトの説明やカテゴリ、「よく使う」の調整は
//   Publicなリポジトリではなく、この個人設定に書く。
//
// 使用回数は Folder.userData/C7_AEScriptsLauncher/usage.json に保存される
// （リポジトリには入らない）。
//
// 一覧のロジック本体は Launcher.core.js（Node上でテスト済み）。
// このファイルはAEの実ファイルシステムへのアクセスとUI表示のみを担当する。
//
// 注意：このファイルはリポジトリ本体とは別の場所（ScriptUI Panelsフォルダ）に
// 単体で置かれる想定のため、#include ではなく、登録済みフォルダのうち
// Launcher/Launcher.core.js を持つもの（＝ae-scriptsリポジトリ本体）から
// 実行時に $.evalFile で読み込む（ensureCoreLoaded関数）。

(function (thisObj) {

    var SETTINGS_SECTION = "AEScriptsLauncher";
    var SETTINGS_KEY_ROOTS = "rootPaths";          // JSON配列文字列
    var SETTINGS_KEY_ROOT_LEGACY = "rootPath";     // 旧バージョン（単一フォルダ）からの移行用
    var SETTINGS_KEY_THIRD_PARTY = "thirdPartyRoots"; // 他人製として扱うフォルダ（JSON配列文字列）
    var SETTINGS_KEY_CATEGORY = "selectedCategory";

    var SELF_FILE_NAME = "AEScriptsLauncher.jsx";
    var THIRD_PARTY_HINT_RE = /(ScriptUI Panels|ThirdParty)/i;
    var BADGE_COLOR = [0.58, 0.58, 0.60, 1];
    var BADGE_SIZE = 8;

    var coreLoadedFrom = null; // 現在ロード済みのLauncher.core.jsのfsName（再ロード判定用）

    // ── 設定の読み書き ──
    function readJsonSetting(key) {
        try {
            if (app.settings.haveSetting(SETTINGS_SECTION, key)) {
                var arr = JSON.parse(app.settings.getSetting(SETTINGS_SECTION, key));
                if (arr instanceof Array) return arr;
            }
        } catch (e) {}
        return null;
    }

    function loadRootPaths() {
        var arr = readJsonSetting(SETTINGS_KEY_ROOTS);
        if (arr) return arr;

        // 旧バージョン（フォルダ1つだけ）の設定が残っていれば引き継ぐ
        try {
            if (app.settings.haveSetting(SETTINGS_SECTION, SETTINGS_KEY_ROOT_LEGACY)) {
                var legacy = app.settings.getSetting(SETTINGS_SECTION, SETTINGS_KEY_ROOT_LEGACY);
                if (legacy) return [legacy];
            }
        } catch (e2) {}

        return [];
    }

    // 他人製フォルダの一覧。未設定（v1からの移行直後）なら、名前から推測する
    function loadThirdPartyPaths(rootPaths) {
        var arr = readJsonSetting(SETTINGS_KEY_THIRD_PARTY);
        if (arr) return arr;
        var guessed = [];
        for (var i = 0; i < rootPaths.length; i++) {
            if (THIRD_PARTY_HINT_RE.test(rootPaths[i])) guessed.push(rootPaths[i]);
        }
        return guessed;
    }

    function saveJsonSetting(key, value) {
        try { app.settings.saveSetting(SETTINGS_SECTION, key, JSON.stringify(value)); } catch (e) {}
    }

    function saveSelectedCategory(name) {
        try { app.settings.saveSetting(SETTINGS_SECTION, SETTINGS_KEY_CATEGORY, name || ""); } catch (e) {}
    }

    function loadSelectedCategory() {
        try {
            if (app.settings.haveSetting(SETTINGS_SECTION, SETTINGS_KEY_CATEGORY)) {
                return app.settings.getSetting(SETTINGS_SECTION, SETTINGS_KEY_CATEGORY);
            }
        } catch (e) {}
        return "";
    }

    // ── テキストファイル（UTF-8）の読み書き ──
    function readTextFile(file) {
        if (!file.exists) return null;
        try {
            file.encoding = "UTF-8";
            if (!file.open("r")) return null;
            var text = file.read();
            file.close();
            if (text.charCodeAt(0) === 0xFEFF) text = text.substring(1);
            return text;
        } catch (e) {
            try { file.close(); } catch (e2) {}
            return null;
        }
    }

    function readJsonFile(file) {
        var text = readTextFile(file);
        if (text === null) return null;
        try { return JSON.parse(text); } catch (e) { return null; }
    }

    // ── 使用回数（Folder.userData に保存。リポジトリには入らない） ──
    function usageFile() {
        var dir = new Folder(Folder.userData.fsName + "/C7_AEScriptsLauncher");
        if (!dir.exists) dir.create();
        return new File(dir.fsName + "/usage.json");
    }

    function loadUsage() {
        var data = readJsonFile(usageFile());
        return (data && typeof data === "object") ? data : {};
    }

    function saveUsage(usage) {
        try {
            var f = usageFile();
            f.encoding = "UTF-8";
            if (!f.open("w")) return;
            f.write(JSON.stringify(usage));
            f.close();
        } catch (e) {}
    }

    // ── Launcher.core.js を、登録済みフォルダの中から見つけて読み込む ──
    function ensureCoreLoaded(rootFolders) {
        var coreFile = null;
        for (var i = 0; i < rootFolders.length; i++) {
            var candidate = new File(rootFolders[i].fsName + "/Launcher/Launcher.core.js");
            if (candidate.exists) { coreFile = candidate; break; }
        }
        if (!coreFile) {
            throw new Error(
                "Launcher.core.js が見つかりません。\n" +
                "登録したフォルダの中に、ae-scripts リポジトリ本体（Launcher/Launcher.core.js を含む\n" +
                "フォルダ）が含まれているか確認してください。"
            );
        }
        if (coreLoadedFrom === coreFile.fsName && typeof LauncherCore !== "undefined" &&
            LauncherCore.buildVirtualGroups) return;
        $.evalFile(coreFile);
        coreLoadedFrom = coreFile.fsName;
    }

    // ── 指定フォルダ配下の .jsx / .jsxbin を再帰的に探す（判定・グルーピングはLauncher.core.jsに委譲） ──
    function collectScripts(rootFolder) {
        var results = [];

        function walk(folder, prefix) {
            var entries = folder.getFiles();
            for (var i = 0; i < entries.length; i++) {
                var entry = entries[i];
                // entry.name はURLエンコードされている（スペース→%20など）ので戻しておく
                var name = File.decode(entry.name);
                if (entry instanceof Folder) {
                    var c0 = name.charAt(0);
                    if (c0 === "." || c0 === "(") continue;
                    if (name === "node_modules" || name === "__tests__") continue;
                    walk(entry, prefix + name + "/");
                } else if (entry instanceof File && /\.(jsx|jsxbin)$/i.test(name)) {
                    results.push({
                        relPath: prefix + name,
                        modified: entry.modified ? entry.modified.getTime() : 0
                    });
                }
            }
        }

        walk(rootFolder, "");
        return results;
    }

    // 各フォルダの Launcher/categories.json と launcher.json をすべて読み、まとめる
    function loadConfig(rootFolders) {
        var configs = [{ excludeFiles: [SELF_FILE_NAME] }];
        for (var i = 0; i < rootFolders.length; i++) {
            var a = readJsonFile(new File(rootFolders[i].fsName + "/Launcher/categories.json"));
            if (a) configs.push(a);
            var b = readJsonFile(new File(rootFolders[i].fsName + "/launcher.json"));
            if (b) configs.push(b);
        }
        var personal = readJsonFile(new File(Folder.userData.fsName + "/C7_AEScriptsLauncher/launcher.json"));
        if (personal) configs.push(personal);
        return LauncherCore.mergeConfigs(configs);
    }

    // ── UI構築 ──
    function buildUI(thisObj) {
        var pal = (thisObj instanceof Panel) ? thisObj : new Window("palette", "AE Scripts", undefined, { resizeable: true });
        pal.orientation = "column";
        pal.alignChildren = ["fill", "top"];
        pal.spacing = 6;
        pal.margins = 8;

        // ── カテゴリ選択 ──
        var categoryRow = pal.add("group");
        categoryRow.alignment = ["fill", "top"];
        categoryRow.spacing = 4;
        var categoryDropdown = categoryRow.add("dropdownlist", undefined, []);
        categoryDropdown.alignment = ["fill", "center"];
        categoryDropdown.minimumSize.width = 140;
        var btnRescan = categoryRow.add("button", undefined, "再スキャン");
        btnRescan.helpTip = "フォルダを読み直して一覧を更新します";
        var btnSettings = categoryRow.add("button", undefined, "設定…");
        btnSettings.preferredSize.width = 52;

        // ── 検索 ──
        var searchRow = pal.add("group");
        searchRow.alignment = ["fill", "top"];
        searchRow.spacing = 4;
        searchRow.add("statictext", undefined, "検索");
        var searchBox = searchRow.add("edittext", undefined, "");
        searchBox.alignment = ["fill", "center"];
        searchBox.helpTip = "名前の一部（スペース区切りで複数語）。空にするとカテゴリ表示に戻ります";

        // ── スクリプトボタン ──
        var scriptsPanel = pal.add("group");
        scriptsPanel.orientation = "column";
        scriptsPanel.alignment = ["fill", "top"];
        scriptsPanel.alignChildren = ["fill", "top"];
        scriptsPanel.spacing = 3;

        var statusText = pal.add("statictext", undefined, "", { truncate: "end" });
        statusText.alignment = ["fill", "bottom"];

        var rootFolders = [];       // Folder[]
        var thirdPartyPaths = [];   // 他人製として扱うフォルダの fsName
        var baseGroups = [];        // LauncherCore.buildScriptList() の戻り値
        var config = {};
        var usage = loadUsage();
        var dropdownEntries = [];   // ドロップダウンの各行に対応する { category, scripts } （区切り線は null）

        function isThirdParty(folder) {
            for (var i = 0; i < thirdPartyPaths.length; i++) {
                if (thirdPartyPaths[i] === folder.fsName) return true;
            }
            return false;
        }

        function persistRoots() {
            var paths = [];
            var tp = [];
            for (var i = 0; i < rootFolders.length; i++) {
                paths.push(rootFolders[i].fsName);
                if (isThirdParty(rootFolders[i])) tp.push(rootFolders[i].fsName);
            }
            thirdPartyPaths = tp;
            saveJsonSetting(SETTINGS_KEY_ROOTS, paths);
            saveJsonSetting(SETTINGS_KEY_THIRD_PARTY, tp);
        }

        function relayout() {
            if (pal.layout) { pal.layout.layout(true); pal.layout.resize(); }
        }

        function clearScripts() {
            while (scriptsPanel.children.length > 0) scriptsPanel.remove(scriptsPanel.children[0]);
        }

        // 他人製の目印：小さなグレーの●（自作の行は同じ幅の空白で端をそろえる）
        function addBadge(row, show) {
            var dot = row.add("statictext", undefined, "");
            dot.preferredSize = [BADGE_SIZE + 2, BADGE_SIZE + 2];
            dot.alignment = ["right", "center"];
            if (!show) return;
            dot.helpTip = "他人製";
            dot.onDraw = function () {
                try {
                    var g = this.graphics;
                    var brush = g.newBrush(g.BrushType.SOLID_COLOR, BADGE_COLOR);
                    g.newPath();
                    g.ellipsePath(1, 1, BADGE_SIZE, BADGE_SIZE);
                    g.fillPath(brush);
                } catch (e) {}
            };
        }

        function addScriptButton(script) {
            var row = scriptsPanel.add("group");
            row.alignment = ["fill", "top"];
            row.spacing = 4;
            row.margins = 0;
            var btn = row.add("button", undefined, script.label);
            btn.alignment = ["fill", "center"];
            btn.helpTip = script.relPath + "\n（Ctrl+クリックでフォルダを開く）";
            btn.onClick = function () { runScript(script); };
            addBadge(row, script.thirdParty);
        }

        function renderScriptButtons() {
            clearScripts();

            var query = searchBox.text;
            var list;
            if (query && query.replace(/[\s　]/g, "") !== "") {
                list = LauncherCore.searchScripts(baseGroups, query, usage, config, 30);
                statusText.text = "検索結果：" + list.length + "件";
            } else {
                var idx = categoryDropdown.selection ? categoryDropdown.selection.index : -1;
                var entry = dropdownEntries[idx];
                list = entry ? entry.scripts : [];
                statusText.text = entry ? (entry.category + "：" + list.length + "件") : "";
            }

            if (baseGroups.length === 0) {
                scriptsPanel.add("statictext", undefined,
                    rootFolders.length === 0
                        ? "フォルダが未登録です。「設定…」から ae-scripts フォルダを追加してください。"
                        : "実行可能なスクリプトが見つかりませんでした。",
                    { multiline: true });
                return;
            }
            if (list.length === 0) {
                scriptsPanel.add("statictext", undefined, "該当するスクリプトがありません。");
                return;
            }
            for (var s = 0; s < list.length; s++) addScriptButton(list[s]);
        }

        function renderCategoryDropdown() {
            var preferredName = (categoryDropdown.selection && dropdownEntries[categoryDropdown.selection.index])
                ? dropdownEntries[categoryDropdown.selection.index].category
                : loadSelectedCategory();

            var virtualGroups = LauncherCore.buildVirtualGroups(baseGroups, usage, config);
            var sortedGroups = LauncherCore.applyUsage(baseGroups, usage, config);

            categoryDropdown.removeAll();
            dropdownEntries = [];
            for (var v = 0; v < virtualGroups.length; v++) {
                categoryDropdown.add("item", virtualGroups[v].category);
                dropdownEntries.push(virtualGroups[v]);
            }
            if (virtualGroups.length > 0 && sortedGroups.length > 0) {
                categoryDropdown.add("separator");
                dropdownEntries.push(null);
            }
            for (var i = 0; i < sortedGroups.length; i++) {
                categoryDropdown.add("item", sortedGroups[i].category + "（" + sortedGroups[i].scripts.length + "）");
                dropdownEntries.push(sortedGroups[i]);
            }

            var restoreIndex = -1;
            for (var j = 0; j < dropdownEntries.length; j++) {
                if (dropdownEntries[j] && dropdownEntries[j].category === preferredName) { restoreIndex = j; break; }
            }
            if (restoreIndex === -1) {
                for (var k = 0; k < dropdownEntries.length; k++) {
                    if (dropdownEntries[k]) { restoreIndex = k; break; }
                }
            }
            if (restoreIndex !== -1) categoryDropdown.selection = restoreIndex;
        }

        function rescan() {
            baseGroups = [];
            if (rootFolders.length === 0) {
                categoryDropdown.removeAll();
                dropdownEntries = [];
                renderScriptButtons();
                relayout();
                return;
            }

            try {
                ensureCoreLoaded(rootFolders);
            } catch (e) {
                categoryDropdown.removeAll();
                dropdownEntries = [];
                clearScripts();
                scriptsPanel.add("statictext", undefined, e.message || e.toString(), { multiline: true });
                relayout();
                return;
            }

            var items = [];
            for (var i = 0; i < rootFolders.length; i++) {
                var tp = isThirdParty(rootFolders[i]);
                var found = collectScripts(rootFolders[i]);
                for (var r = 0; r < found.length; r++) {
                    items.push({ relPath: found[r].relPath, rootIndex: i, thirdParty: tp, modified: found[r].modified });
                }
            }

            config = loadConfig(rootFolders);
            usage = loadUsage();
            baseGroups = LauncherCore.buildScriptList(items, config);

            renderCategoryDropdown();
            renderScriptButtons();
            relayout();
        }

        // ── 設定ダイアログ（フォルダの追加・削除、他人製の指定） ──
        function openSettings() {
            var dlg = new Window("dialog", "ランチャー設定");
            dlg.orientation = "column";
            dlg.alignChildren = ["fill", "top"];
            dlg.margins = 12;
            dlg.spacing = 8;

            var pnl = dlg.add("panel", undefined, "  スキャンするフォルダ");
            pnl.orientation = "column";
            pnl.alignChildren = ["fill", "top"];
            pnl.margins = [10, 16, 10, 10];
            pnl.spacing = 4;

            var listGroup = pnl.add("group");
            listGroup.orientation = "column";
            listGroup.alignChildren = ["fill", "top"];
            listGroup.spacing = 3;

            var work = [];
            for (var i = 0; i < rootFolders.length; i++) {
                work.push({ folder: rootFolders[i], thirdParty: isThirdParty(rootFolders[i]) });
            }

            function renderList() {
                while (listGroup.children.length > 0) listGroup.remove(listGroup.children[0]);
                if (work.length === 0) {
                    listGroup.add("statictext", undefined, "フォルダが未登録です。");
                }
                for (var w = 0; w < work.length; w++) {
                    (function (entry, index) {
                        var row = listGroup.add("group");
                        row.alignment = ["fill", "top"];
                        var cb = row.add("checkbox", undefined, "他人製");
                        cb.value = entry.thirdParty;
                        cb.helpTip = "チェックすると、直下のファイルも拾い、ボタンに●の目印がつきます";
                        cb.onClick = function () { entry.thirdParty = cb.value; };
                        var lbl = row.add("statictext", undefined, entry.folder.fsName, { truncate: "middle" });
                        lbl.alignment = ["fill", "center"];
                        lbl.characters = 40;
                        var btnRemove = row.add("button", undefined, "削除");
                        btnRemove.preferredSize.width = 50;
                        btnRemove.onClick = function () {
                            work.splice(index, 1);
                            renderList();
                            dlg.layout.layout(true);
                        };
                    })(work[w], w);
                }
            }
            renderList();

            var btnAdd = pnl.add("button", undefined, "フォルダを追加…");
            btnAdd.onClick = function () {
                var f = Folder.selectDialog("スクリプトフォルダを選択してください（ae-scripts本体、または他人製スクリプトのフォルダ）");
                if (!f) return;
                for (var a = 0; a < work.length; a++) {
                    if (work[a].folder.fsName === f.fsName) { alert("すでに登録済みです。"); return; }
                }
                work.push({ folder: f, thirdParty: THIRD_PARTY_HINT_RE.test(f.fsName) });
                renderList();
                dlg.layout.layout(true);
            };

            var usageRow = dlg.add("group");
            usageRow.alignment = ["fill", "top"];
            var btnResetUsage = usageRow.add("button", undefined, "使用回数をリセット");
            btnResetUsage.onClick = function () {
                usage = {};
                saveUsage(usage);
                btnResetUsage.text = "リセットしました";
            };

            var btns = dlg.add("group");
            btns.alignment = ["right", "top"];
            btns.add("button", undefined, "キャンセル", { name: "cancel" });
            btns.add("button", undefined, "OK", { name: "ok" });

            if (dlg.show() !== 1) return;

            rootFolders = [];
            thirdPartyPaths = [];
            for (var n = 0; n < work.length; n++) {
                rootFolders.push(work[n].folder);
                if (work[n].thirdParty) thirdPartyPaths.push(work[n].folder.fsName);
            }
            persistRoots();
            rescan();
        }

        function runScript(script) {
            var base = rootFolders[script.rootIndex];
            if (!base) { alert("フォルダ情報が見つかりません。再スキャンしてください。"); return; }
            var target = new File(base.fsName + "/" + script.relPath);
            if (!target.exists) {
                alert("スクリプトが見つかりません：\n" + target.fsName + "\n\n「再スキャン」を押してください。");
                return;
            }

            // Ctrl+クリック：実行せずにフォルダを開く
            var ctrl = false;
            try { ctrl = ScriptUI.environment.keyboardState.ctrlKey; } catch (e0) {}
            if (ctrl) { target.parent.execute(); return; }

            usage = LauncherCore.recordUse(loadUsage(), script);
            saveUsage(usage);

            // 自分のフォルダを基準に素材（アイコン・プリセット等）を探すスクリプト用
            var prevCurrent = Folder.current;
            try {
                Folder.current = target.parent;
                $.evalFile(target);
            } catch (e) {
                alert("実行エラー（" + script.relPath + "）：\n" + e.toString());
            } finally {
                try { Folder.current = prevCurrent; } catch (e2) {}
            }
        }

        btnRescan.onClick = rescan;
        btnSettings.onClick = openSettings;
        searchBox.onChanging = function () {
            renderScriptButtons();
            relayout();
        };
        categoryDropdown.onChange = function () {
            if (!categoryDropdown.selection) return;
            var entry = dropdownEntries[categoryDropdown.selection.index];
            if (!entry) return;
            saveSelectedCategory(entry.category);
            if (searchBox.text !== "") searchBox.text = "";
            renderScriptButtons();
            relayout();
        };
        pal.onResizing = pal.onResize = function () { this.layout.resize(); };

        // ── 初期化：保存済みフォルダを復元 ──
        var savedPaths = loadRootPaths();
        thirdPartyPaths = loadThirdPartyPaths(savedPaths);
        for (var p = 0; p < savedPaths.length; p++) {
            var folder = new Folder(savedPaths[p]);
            if (folder.exists) rootFolders.push(folder);
        }

        rescan();

        return pal;
    }

    var myPanel = buildUI(thisObj);
    if (myPanel instanceof Window) {
        myPanel.center();
        myPanel.show();
    }

// ScriptUI Panels のローダー（AEScriptsLauncher_Loader.jsx）経由で読み込まれた場合は、
// ローダーが受け取ったパネルを使う。直接置いた場合は従来どおり this。
})(($.global.C7_LAUNCHER_HOST) ? $.global.C7_LAUNCHER_HOST : this);
