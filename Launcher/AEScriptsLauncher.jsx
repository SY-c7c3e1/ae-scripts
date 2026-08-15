// AEScriptsLauncher.jsx
// ae-scripts ランチャーパネル
//
// セットアップ：
//   1. このファイル（AEScriptsLauncher.jsx）だけを AE の
//      `Support Files/Scripts/ScriptUI Panels/` フォルダに置き、AEを再起動する
//      （リポジトリ本体は好きな場所に置いたままでよい。コピー不要）
//   2. AEのメニュー：Window > AEScriptsLauncher.jsx を選ぶとパネルとして開く
//      （他のパネルと同様にドッキング可能）
//   3. 初回のみ「フォルダを選択…」で、この ae-scripts リポジトリの
//      ルートフォルダ（package.json がある場所）を指定する
//      → 次回以降はAEの設定に保存されるので選び直し不要
//   4. カテゴリごとに並んだボタンを押すと、対応するスクリプトがその場で
//      直接実行される（$.evalFile）。フォルダを開く必要はない。
//
// スクリプト一覧は、パネルを開くたび／「再スキャン」を押すたびに
// リポジトリフォルダを走査して作られる。新しいスクリプトフォルダを
// 追加したら「再スキャン」を押せばボタンが増える。
//
// カテゴリ名・表示順・ラベルを変えたい場合は Launcher/categories.json を編集する
// （編集しなくても、フォルダ名がそのままカテゴリ名としてボタンが並ぶ）。
//
// 一覧のグルーピングロジック本体は Launcher.core.js（Node上でテスト済み）。
// このファイルはAEの実ファイルシステムへのアクセスとUI表示のみを担当する。

#include "Launcher.core.js"

(function (thisObj) {

    var SETTINGS_SECTION = "AEScriptsLauncher";
    var SETTINGS_KEY_ROOT = "rootPath";

    // ── 設定の読み書き（AE標準のpersistent settings。ae-scripts自体には保存しない） ──
    function getSavedRootPath() {
        try {
            if (app.settings.haveSetting(SETTINGS_SECTION, SETTINGS_KEY_ROOT)) {
                return app.settings.getSetting(SETTINGS_SECTION, SETTINGS_KEY_ROOT);
            }
        } catch (e) {}
        return "";
    }

    function saveRootPath(path) {
        try { app.settings.saveSetting(SETTINGS_SECTION, SETTINGS_KEY_ROOT, path); } catch (e) {}
    }

    // ── リポジトリ内の .jsx を再帰的に探す（判定・グルーピングはLauncher.core.jsに委譲） ──
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

    function loadCategoriesConfig(rootFolder) {
        var f = new File(rootFolder.fsName + "/Launcher/categories.json");
        if (!f.exists) return {};
        try {
            f.open("r");
            var text = f.read();
            f.close();
            return JSON.parse(text);
        } catch (e) {
            return {};
        }
    }

    // ── UI構築 ──
    function buildUI(thisObj) {
        var pal = (thisObj instanceof Panel) ? thisObj : new Window("palette", "AE Scripts", undefined, { resizeable: true });
        pal.orientation = "column";
        pal.alignChildren = ["fill", "top"];
        pal.spacing = 6;
        pal.margins = 10;

        var lblRoot = pal.add("statictext", undefined, "", { truncate: "middle" });
        lblRoot.characters = 40;

        var listGroup = pal.add("group");
        listGroup.orientation = "column";
        listGroup.alignChildren = ["fill", "top"];
        listGroup.spacing = 8;

        var footerGroup = pal.add("group");
        footerGroup.alignment = "fill";
        var btnChangeFolder = footerGroup.add("button", undefined, "フォルダ変更");
        var btnRescan = footerGroup.add("button", undefined, "再スキャン");

        var rootFolder = null;

        function clearListGroup() {
            while (listGroup.children.length > 0) listGroup.remove(listGroup.children[0]);
        }

        function render() {
            clearListGroup();

            if (!rootFolder || !rootFolder.exists) {
                lblRoot.text = "スクリプトフォルダが未設定です。";
                var btnSelect = listGroup.add("button", undefined, "フォルダを選択…");
                btnSelect.onClick = selectFolder;
                if (pal.layout) pal.layout.layout(true);
                return;
            }

            lblRoot.text = rootFolder.fsName;

            var relPaths = collectJsxRelPaths(rootFolder);
            var config = loadCategoriesConfig(rootFolder);
            var groups = LauncherCore.buildScriptList(relPaths, config);

            if (groups.length === 0) {
                listGroup.add("statictext", undefined, "実行可能なスクリプトが見つかりませんでした。");
            }

            for (var g = 0; g < groups.length; g++) {
                var group = groups[g];
                var groupPanel = listGroup.add("panel", undefined, "  " + group.category);
                groupPanel.orientation = "column";
                groupPanel.alignChildren = ["fill", "top"];
                groupPanel.margins = [10, 14, 10, 8];
                groupPanel.spacing = 4;

                for (var s = 0; s < group.scripts.length; s++) {
                    (function (script) {
                        var btn = groupPanel.add("button", undefined, script.label);
                        btn.helpTip = script.relPath;
                        btn.onClick = function () { runScript(script.relPath); };
                    })(group.scripts[s]);
                }
            }

            if (pal.layout) pal.layout.layout(true);
        }

        function selectFolder() {
            var f = Folder.selectDialog("ae-scripts リポジトリのルートフォルダを選択してください");
            if (!f) return;
            rootFolder = f;
            saveRootPath(f.fsName);
            render();
        }

        function runScript(relPath) {
            var target = new File(rootFolder.fsName + "/" + relPath);
            if (!target.exists) {
                alert("スクリプトが見つかりません：\n" + target.fsName);
                return;
            }
            try {
                $.evalFile(target);
            } catch (e) {
                alert("実行エラー（" + relPath + "）：\n" + e.toString());
            }
        }

        btnChangeFolder.onClick = selectFolder;
        btnRescan.onClick = render;

        var savedPath = getSavedRootPath();
        if (savedPath) {
            var savedFolder = new Folder(savedPath);
            if (savedFolder.exists) rootFolder = savedFolder;
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
