// AEScriptsLauncher.jsx（ローダー）
// ScriptUI Panels に置く小さなファイル。中身のランチャー本体は ae-scripts リポジトリの
// Launcher/AEScriptsLauncher.jsx を毎回読み込んで動かす。
// → ランチャーを改修しても、リポジトリ側を更新するだけで反映される
//   （Program Files の中を書き換える必要がない）。
//
// 設置：このファイルを「AEScriptsLauncher.jsx」という名前で
//       Support Files/Scripts/ScriptUI Panels/ に置く。
// リポジトリの場所は、ランチャーに登録済みのフォルダから探す。
// 登録が読めないときは ドキュメント/GitHub/ae-scripts を探し、それも無いときだけ
// ae-scripts フォルダを選ぶ画面が出る。

(function (thisObj) {
    var SECTION = "AEScriptsLauncher";
    var KEY_ROOTS = "rootPaths";
    var REL = "/Launcher/AEScriptsLauncher.jsx";
    // 登録が読めないときに見に行く、いつもの場所
    var DEFAULT_REPO = Folder.myDocuments.fsName + "/GitHub/ae-scripts";

    // ── JSON の読み書き ──
    // AE の ExtendScript には JSON が標準で入っていない（他のスクリプトが追加している
    // ことが多いが、AE起動直後はまだ無いことがある）。無ければ自前の簡易版を使う。
    var J = (typeof JSON !== "undefined" && JSON.parse && JSON.stringify) ? JSON : {
        parse: function (text) {
            // 自分で保存した設定・自分のフォルダの設定ファイルだけを読む前提
            return eval("(" + text + ")");
        },
        stringify: function (value) {
            function str(v) {
                if (v === null || v === undefined) return "null";
                var t = typeof v;
                if (t === "number") return isFinite(v) ? String(v) : "null";
                if (t === "boolean") return v ? "true" : "false";
                if (t === "string") {
                    return '"' + v.replace(/[\\"\u0000-\u001f]/g, function (c) {
                        if (c === "\\") return "\\\\";
                        if (c === '"') return '\\"';
                        var h = c.charCodeAt(0).toString(16);
                        return "\\u" + "0000".substring(h.length) + h;
                    }) + '"';
                }
                if (v instanceof Array) {
                    var a = [];
                    for (var i = 0; i < v.length; i++) a.push(str(v[i]));
                    return "[" + a.join(",") + "]";
                }
                if (t === "object") {
                    var o = [];
                    for (var k in v) {
                        if (v.hasOwnProperty(k) && typeof v[k] !== "function") o.push(str(k) + ":" + str(v[k]));
                    }
                    return "{" + o.join(",") + "}";
                }
                return "null";
            }
            return str(value);
        }
    };

    var rootsUnreadable = false; // 設定はあるのに読めなかった（上書きしてはいけない）

    function loadRoots() {
        try {
            if (app.settings.haveSetting(SECTION, KEY_ROOTS)) {
                var arr = J.parse(app.settings.getSetting(SECTION, KEY_ROOTS));
                if (arr instanceof Array) return arr;
                rootsUnreadable = true;
            }
        } catch (e) { rootsUnreadable = true; }
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

    // 登録が読めなくても、いつもの場所にあればそれを使う（場所を聞かない）
    if (!main) {
        var def = new File(DEFAULT_REPO + REL);
        if (def.exists) main = def;
    }

    if (!main) {
        var picked = Folder.selectDialog("ae-scripts リポジトリのフォルダ（Launcher フォルダがある場所）を選んでください");
        if (picked && new File(picked.fsName + REL).exists) {
            roots.unshift(picked.fsName);
            if (!rootsUnreadable) {
                try { app.settings.saveSetting(SECTION, KEY_ROOTS, J.stringify(roots)); } catch (e2) {}
            }
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
