// AEScriptsLauncher.jsx
// ae-scripts ランチャーパネル
//
// セットアップ：
//   1. このファイル（AEScriptsLauncher.jsx）だけを AE の
//      `Support Files/Scripts/ScriptUI Panels/` フォルダに置き、AEを再起動する
//      （リポジトリ本体は好きな場所に置いたままでよい。コピー不要）
//   2. AEのメニュー：Window > AEScriptsLauncher.jsx を選ぶとパネルとして開く
//      （他のパネルと同様にドッキング可能）
//   3. 初回のみ「フォルダを追加…」で、この ae-scripts リポジトリの
//      ルートフォルダ（package.json がある場所）を指定する
//      → 次回以降はAEの設定に保存されるので選び直し不要
//   4. カテゴリのドロップダウンで選んだカテゴリのボタンが下に並び、
//      押すと対応するスクリプトがその場で直接実行される（$.evalFile）。
//      フォルダを開く必要はない。
//
// 複数フォルダ対応：
//   ae-scripts リポジトリ本体（git管理・Public）以外に、非公開の個人用
//   フォルダや、他の人が作ったスクリプトを置いたフォルダを「追加」で
//   もう1つ登録できる。git管理下に置きたくないスクリプトは、そちらの
//   フォルダに置けば、このリポジトリにコミットされることなく同じパネルの
//   ボタンとして使える。
//
// スクリプト一覧は、パネルを開くたび／「再スキャン」を押すたびに
// 登録済みの各フォルダを走査して作られる。新しいスクリプトフォルダを
// 追加したら「再スキャン」を押せばボタンが増える。
//
// カテゴリ名・表示順・ラベルを変えたい場合は、ae-scriptsリポジトリ側の
// Launcher/categories.json を編集する（フォルダ名がキーなので、追加フォルダ
// 内のスクリプトにも同じ設定が効く）。編集しなくてもフォルダ名がそのまま
// カテゴリ名としてボタンが並ぶ。
//
// 一覧のグルーピングロジック本体は Launcher.core.js（Node上でテスト済み）。
// このファイルはAEの実ファイルシステムへのアクセスとUI表示のみを担当する。
//
// 注意：このファイルはリポジトリ本体とは別の場所（ScriptUI Panelsフォルダ）に
// 単体で置かれる想定のため、#include ではなく、登録済みフォルダのうち
// Launcher/Launcher.core.js を持つもの（＝ae-scriptsリポジトリ本体）から
// 実行時に $.evalFile で読み込む（ensureCoreLoaded関数）。

(function (thisObj) {

    var SETTINGS_SECTION = "AEScriptsLauncher";
    var SETTINGS_KEY_ROOTS = "rootPaths";     // JSON配列文字列
    var SETTINGS_KEY_ROOT_LEGACY = "rootPath"; // 旧バージョン（単一フォルダ）からの移行用
    var SETTINGS_KEY_CATEGORY = "selectedCategory";

    var coreLoadedFrom = null; // 現在ロード済みのLauncher.core.jsのfsName（再ロード判定用）

    // ── 設定の読み書き ──
    function loadRootPaths() {
        try {
            if (app.settings.haveSetting(SETTINGS_SECTION, SETTINGS_KEY_ROOTS)) {
                var raw = app.settings.getSetting(SETTINGS_SECTION, SETTINGS_KEY_ROOTS);
                var arr = JSON.parse(raw);
                if (arr instanceof Array) return arr;
            }
        } catch (e) {}

        // 旧バージョン（フォルダ1つだけ）の設定が残っていれば引き継ぐ
        try {
            if (app.settings.haveSetting(SETTINGS_SECTION, SETTINGS_KEY_ROOT_LEGACY)) {
                var legacy = app.settings.getSetting(SETTINGS_SECTION, SETTINGS_KEY_ROOT_LEGACY);
                if (legacy) return [legacy];
            }
        } catch (e2) {}

        return [];
    }

    function saveRootPaths(paths) {
        try { app.settings.saveSetting(SETTINGS_SECTION, SETTINGS_KEY_ROOTS, JSON.stringify(paths)); } catch (e) {}
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
        if (coreLoadedFrom === coreFile.fsName && typeof LauncherCore !== "undefined") return;
        $.evalFile(coreFile);
        coreLoadedFrom = coreFile.fsName;
    }

    // ── 指定フォルダ配下の .jsx を再帰的に探す（判定・グルーピングはLauncher.core.jsに委譲） ──
    function collectJsxRelPaths(rootFolder) {
        var results = [];

        function walk(folder, prefix) {
            var entries = folder.getFiles();
            for (var i = 0; i < entries.length; i++) {
                var entry = entries[i];
                if (entry instanceof Folder) {
                    if (entry.name.charAt(0) === ".") continue;
                    if (entry.name === "node_modules" || entry.name === "__tests__") continue;
                    walk(entry, prefix + entry.name + "/");
                } else if (entry instanceof File && /\.jsx$/i.test(entry.name)) {
                    results.push(prefix + entry.name);
                }
            }
        }

        walk(rootFolder, "");
        return results;
    }

    // categories.json は、登録済みフォルダのうち最初に見つかったものだけを使う
    // （フォルダ名ベースの設定なので、通常はae-scriptsリポジトリ本体の1つで足りる）
    function loadCategoriesConfig(rootFolders) {
        for (var i = 0; i < rootFolders.length; i++) {
            var f = new File(rootFolders[i].fsName + "/Launcher/categories.json");
            if (!f.exists) continue;
            try {
                f.open("r");
                var text = f.read();
                f.close();
                return JSON.parse(text);
            } catch (e) {
                return {};
            }
        }
        return {};
    }

    // ── UI構築 ──
    function buildUI(thisObj) {
        var pal = (thisObj instanceof Panel) ? thisObj : new Window("palette", "AE Scripts", undefined, { resizeable: true });
        pal.orientation = "column";
        pal.alignChildren = ["fill", "top"];
        pal.spacing = 6;
        pal.margins = 10;

        // ── フォルダ設定 ──
        var secFolders = pal.add("panel", undefined, "  フォルダ");
        secFolders.orientation = "column";
        secFolders.alignChildren = ["fill", "top"];
        secFolders.margins = [10, 14, 10, 8];
        secFolders.spacing = 4;

        var folderListGroup = secFolders.add("group");
        folderListGroup.orientation = "column";
        folderListGroup.alignChildren = ["fill", "top"];
        folderListGroup.spacing = 3;

        var btnAddFolder = secFolders.add("button", undefined, "フォルダを追加…");

        // ── カテゴリ選択 ──
        var categoryRow = pal.add("group");
        categoryRow.alignment = "fill";
        categoryRow.add("statictext", undefined, "カテゴリ：");
        var categoryDropdown = categoryRow.add("dropdownlist", undefined, []);
        categoryDropdown.alignment = ["fill", "center"];
        categoryDropdown.minimumSize.width = 160;

        // ── スクリプトボタン ──
        var scriptsPanel = pal.add("panel", undefined, "");
        scriptsPanel.orientation = "column";
        scriptsPanel.alignChildren = ["fill", "top"];
        scriptsPanel.margins = [10, 14, 10, 8];
        scriptsPanel.spacing = 4;

        var footerGroup = pal.add("group");
        footerGroup.alignment = "fill";
        var btnRescan = footerGroup.add("button", undefined, "再スキャン");

        var rootFolders = [];  // Folder[]
        var groups = [];       // LauncherCore.buildScriptList() の戻り値

        function persistRoots() {
            var paths = [];
            for (var i = 0; i < rootFolders.length; i++) paths.push(rootFolders[i].fsName);
            saveRootPaths(paths);
        }

        function renderFolderList() {
            while (folderListGroup.children.length > 0) folderListGroup.remove(folderListGroup.children[0]);

            if (rootFolders.length === 0) {
                folderListGroup.add("statictext", undefined, "フォルダが未登録です。「フォルダを追加…」から選んでください。");
                return;
            }

            for (var i = 0; i < rootFolders.length; i++) {
                (function (folder, index) {
                    var row = folderListGroup.add("group");
                    row.alignment = "fill";
                    var lbl = row.add("statictext", undefined, folder.fsName, { truncate: "middle" });
                    lbl.alignment = ["fill", "center"];
                    lbl.characters = 34;
                    var btnRemove = row.add("button", undefined, "削除");
                    btnRemove.onClick = function () {
                        rootFolders.splice(index, 1);
                        persistRoots();
                        render();
                    };
                })(rootFolders[i], i);
            }
        }

        function renderScriptButtons() {
            while (scriptsPanel.children.length > 0) scriptsPanel.remove(scriptsPanel.children[0]);

            if (groups.length === 0) {
                scriptsPanel.add("statictext", undefined, "実行可能なスクリプトが見つかりませんでした。");
                return;
            }

            var selectedIndex = categoryDropdown.selection ? categoryDropdown.selection.index : 0;
            var group = groups[selectedIndex];
            if (!group) return;

            for (var s = 0; s < group.scripts.length; s++) {
                (function (script) {
                    var btn = scriptsPanel.add("button", undefined, script.label);
                    btn.helpTip = script.relPath;
                    btn.onClick = function () { runScript(script); };
                })(group.scripts[s]);
            }
        }

        function renderCategoryDropdown() {
            var preferredName = categoryDropdown.selection ? categoryDropdown.selection.text : loadSelectedCategory();

            categoryDropdown.removeAll();
            for (var i = 0; i < groups.length; i++) {
                categoryDropdown.add("item", groups[i].category);
            }

            var restoreIndex = 0;
            for (var j = 0; j < groups.length; j++) {
                if (groups[j].category === preferredName) { restoreIndex = j; break; }
            }
            if (categoryDropdown.items.length > 0) categoryDropdown.selection = restoreIndex;
        }

        function rescan() {
            if (rootFolders.length === 0) {
                groups = [];
                renderCategoryDropdown();
                renderScriptButtons();
                return;
            }

            try {
                ensureCoreLoaded(rootFolders);
            } catch (e) {
                groups = [];
                categoryDropdown.removeAll();
                while (scriptsPanel.children.length > 0) scriptsPanel.remove(scriptsPanel.children[0]);
                scriptsPanel.add("statictext", undefined, e.message || e.toString(), { multiline: true });
                if (pal.layout) pal.layout.layout(true);
                return;
            }

            var items = [];
            for (var i = 0; i < rootFolders.length; i++) {
                var relPaths = collectJsxRelPaths(rootFolders[i]);
                for (var r = 0; r < relPaths.length; r++) {
                    items.push({ relPath: relPaths[r], rootIndex: i });
                }
            }

            var config = loadCategoriesConfig(rootFolders);
            groups = LauncherCore.buildScriptList(items, config);

            renderCategoryDropdown();
            renderScriptButtons();
            if (pal.layout) pal.layout.layout(true);
        }

        function render() {
            renderFolderList();
            rescan();
            if (pal.layout) pal.layout.layout(true);
        }

        function addFolder() {
            var f = Folder.selectDialog("スクリプトフォルダを選択してください（ae-scripts本体、または個人用フォルダ）");
            if (!f) return;
            for (var i = 0; i < rootFolders.length; i++) {
                if (rootFolders[i].fsName === f.fsName) { alert("すでに登録済みです。"); return; }
            }
            rootFolders.push(f);
            persistRoots();
            render();
        }

        btnAddFolder.onClick = addFolder;
        btnRescan.onClick = render;
        categoryDropdown.onChange = function () {
            saveSelectedCategory(categoryDropdown.selection ? categoryDropdown.selection.text : "");
            renderScriptButtons();
            if (pal.layout) pal.layout.layout(true);
        };

        function runScript(script) {
            var base = rootFolders[script.rootIndex];
            if (!base) { alert("フォルダ情報が見つかりません。再スキャンしてください。"); return; }
            var target = new File(base.fsName + "/" + script.relPath);
            if (!target.exists) {
                alert("スクリプトが見つかりません：\n" + target.fsName);
                return;
            }
            try {
                $.evalFile(target);
            } catch (e) {
                alert("実行エラー（" + script.relPath + "）：\n" + e.toString());
            }
        }

        // ── 初期化：保存済みフォルダを復元 ──
        var savedPaths = loadRootPaths();
        for (var p = 0; p < savedPaths.length; p++) {
            var folder = new Folder(savedPaths[p]);
            if (folder.exists) rootFolders.push(folder);
        }

        render();

        return pal;
    }

    var myPanel = buildUI(thisObj);
    if (myPanel instanceof Window) {
        myPanel.center();
        myPanel.show();
    }

})(this);
