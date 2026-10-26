// AEScriptsLauncher.jsx（ローダー）
// ScriptUI Panels に置く小さなファイル。中身のランチャー本体は ae-scripts リポジトリの
// Launcher/AEScriptsLauncher.jsx を毎回読み込んで動かす。
// → ランチャーを改修しても、リポジトリ側を更新するだけで反映される
//   （Program Files の中を書き換える必要がない）。
//
// 設置：このファイルを「AEScriptsLauncher.jsx」という名前で
//       Support Files/Scripts/ScriptUI Panels/ に置く。
// リポジトリの場所は、ランチャーに登録済みのフォルダから探す。
// 見つからなければ ae-scripts フォルダを選ぶ画面が出る（1回だけ）。

(function (thisObj) {
    var SECTION = "AEScriptsLauncher";
    var KEY_ROOTS = "rootPaths";
    var REL = "/Launcher/AEScriptsLauncher.jsx";

    function loadRoots() {
        try {
            if (app.settings.haveSetting(SECTION, KEY_ROOTS)) {
                var arr = JSON.parse(app.settings.getSetting(SECTION, KEY_ROOTS));
                if (arr instanceof Array) return arr;
            }
        } catch (e) {}
        return [];
    }

    function findMain(roots) {
        for (var i = 0; i < roots.length; i++) {
            var f = new File(roots[i] + REL);
            if (f.exists) return f;
        }
        return null;
    }

    var roots = loadRoots();
    var main = findMain(roots);

    if (!main) {
        var picked = Folder.selectDialog("ae-scripts リポジトリのフォルダ（Launcher フォルダがある場所）を選んでください");
        if (picked && new File(picked.fsName + REL).exists) {
            roots.unshift(picked.fsName);
            try { app.settings.saveSetting(SECTION, KEY_ROOTS, JSON.stringify(roots)); } catch (e2) {}
            main = new File(picked.fsName + REL);
        }
    }

    if (!main) {
        if (thisObj instanceof Panel) {
            thisObj.add("statictext", undefined, "ae-scripts が見つかりません。パネルを開き直してフォルダを選んでください。");
            thisObj.layout.layout(true);
        } else {
            alert("ae-scripts が見つかりません。");
        }
        return;
    }

    $.global.C7_LAUNCHER_HOST = thisObj;
    try {
        $.evalFile(main);
    } catch (e3) {
        alert("ランチャーの読み込みでエラーが発生しました：\n" + e3.toString() + "\n\n" + main.fsName);
    } finally {
        $.global.C7_LAUNCHER_HOST = undefined;
    }
})(this);
