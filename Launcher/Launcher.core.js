// Launcher.core.js
// AEScriptsLauncher.jsx のロジック本体（UI・実ファイルシステム非依存）。
//
// AEScriptsLauncher.jsx 側は「設定済みの各フォルダ（root）内の .jsx を
// 再帰的に探す」という実ファイルシステムへのアクセスだけを担当し、見つけた
// 相対パス＋どのrootから見つかったか（rootIndex）などを配列にしてここに渡す。
// ここでは、カテゴリごとのグルーピング・並び替え・除外、使用回数による並び替え、
// 「よく使う」「立ち上げ時」「最近追加・更新」の仮想カテゴリ作成、検索を行う
// （純粋なロジックなのでNodeでテスト可能）。
//
// ExtendScript側からは実行時に $.evalFile で読み込み、テスト側からは
// Node の require() で読み込む（詳細は testing/README.md）。
//
// ── 設定（config）の項目 ──
//   excludeDirs:   string[]  走査結果から除外するトップフォルダ名（デフォルトに追加）
//   excludeFiles:  string[]  除外するファイル（"フォルダ/ファイル名" またはファイル名だけ）
//   categories:    { フォルダ名: 表示カテゴリ名 }   同じ表示名にした複数フォルダは1カテゴリに統合
//   fileCategories:{ ファイル名 or 相対パス: 表示カテゴリ名 }  ファイル単位の上書き
//                  （他人製フォルダの直下にあるファイルはこれでカテゴリを決める）
//   order:         string[]  フォルダ名でのカテゴリ表示順（旧形式）
//   categoryOrder: string[]  表示カテゴリ名での表示順（こちらが優先）
//   labels:        { 相対パス or ファイル名: 表示ラベル }
//   startup:       string[]  「立ち上げ時」に出すファイル（相対パス or ファイル名）
//   initialUsage:  { 相対パス or ファイル名: 数値 }  使用回数の初期値（よく使う／たまに 等）
//   frequentLimit: number    「よく使う」に出す最大数（デフォルト12）
//   frequentExclude: string[] 「よく使う」に出さないもの（相対パス・ファイル名・表示カテゴリ名）
//   recentDays:    number    「最近追加・更新」の日数（デフォルト7）
//
// ── items（AEScriptsLauncher.jsx から渡されるもの）──
//   { relPath: "MarkerCopy/MarkerCopy.jsx", rootIndex: 0,
//     thirdParty: false,   // 他人製フォルダから見つかったか（省略時 false）
//     modified: 1730000000000 } // 更新日時（ミリ秒・省略可）
//   thirdParty のフォルダだけ、ルート直下のファイルも拾う
//   （ScriptUI Panels のようにファイルが直下に並んでいるフォルダ用）。

(function (global) {

    var DEFAULT_EXCLUDE_DIRS = ["testing", "Launcher", "node_modules", ".git"];

    // 実行可能なスクリプトとして扱う拡張子。.jsxbin はコンパイル済み
    // ExtendScript（ソース非公開で配布されることが多い）で、$.evalFile で
    // .jsx と同様に実行できる。
    var SCRIPT_EXT_RE = /\.(jsx|jsxbin)$/i;

    var FREQUENT_CATEGORY = "★ よく使う";
    var STARTUP_CATEGORY  = "立ち上げ時";
    var RECENT_CATEGORY   = "最近追加・更新";
    var OTHER_CATEGORY    = "その他";
    var DAY_MS = 24 * 60 * 60 * 1000;

    function contains(arr, value) {
        if (!arr) return false;
        for (var i = 0; i < arr.length; i++) if (arr[i] === value) return true;
        return false;
    }

    function indexOfArr(arr, value) {
        if (!arr) return -1;
        for (var i = 0; i < arr.length; i++) if (arr[i] === value) return i;
        return -1;
    }

    function hasOwn(obj, key) {
        return obj && Object.prototype.hasOwnProperty.call(obj, key);
    }

    function baseName(relPath) {
        var segs = relPath.split("/");
        return segs[segs.length - 1];
    }

    // 相対パス → ファイル名 の順で設定を探す
    function lookup(map, relPath) {
        if (!map) return undefined;
        if (hasOwn(map, relPath)) return map[relPath];
        var b = baseName(relPath);
        if (hasOwn(map, b)) return map[b];
        return undefined;
    }

    function listHas(list, relPath) {
        return contains(list, relPath) || contains(list, baseName(relPath));
    }

    function normalizePath(p) {
        return String(p).replace(/\\/g, "/");
    }

    // 使用回数ストアやスクリプト同士の同一判定に使うキー
    function scriptKey(script) {
        return normalizePath(script.relPath);
    }

    function compareLabel(a, b) {
        return a.label < b.label ? -1 : (a.label > b.label ? 1 : 0);
    }

    // 戻り値: [{ category: string, scripts: [{ label, relPath, rootIndex, thirdParty, modified }] }]
    function buildScriptList(items, config) {
        config = config || {};
        var excludeDirs = DEFAULT_EXCLUDE_DIRS.concat(config.excludeDirs || []);
        var categories = config.categories || {};
        var order = config.order || [];
        var categoryOrder = config.categoryOrder || [];

        var groups = {}; // categoryName -> { scripts: [], orderRank: number }

        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var relPath = normalizePath(item.relPath);
            if (!SCRIPT_EXT_RE.test(relPath)) continue;
            if (relPath.indexOf("__tests__/") !== -1) continue;

            var segments = relPath.split("/");
            var thirdParty = !!item.thirdParty;
            // ルート直下のファイルは、他人製フォルダの場合だけ拾う
            if (segments.length < 2 && !thirdParty) continue;

            // "." で始まるフォルダと、AEの慣習で「()」で囲んだフォルダは対象外
            var skip = false;
            for (var s = 0; s < segments.length - 1; s++) {
                var c0 = segments[s].charAt(0);
                if (c0 === "." || c0 === "(") { skip = true; break; }
            }
            if (skip) continue;

            var topFolder = segments.length >= 2 ? segments[0] : "";
            if (topFolder && contains(excludeDirs, topFolder)) continue;
            if (listHas(config.excludeFiles, relPath)) continue;

            var fileBase = segments[segments.length - 1].replace(SCRIPT_EXT_RE, "");
            var label = lookup(config.labels, relPath) || fileBase;

            var categoryName = lookup(config.fileCategories, relPath);
            if (!categoryName) {
                categoryName = topFolder ? (categories[topFolder] || topFolder) : OTHER_CATEGORY;
            }

            var orderRank;
            var catIdx = indexOfArr(categoryOrder, categoryName);
            if (catIdx !== -1) {
                orderRank = catIdx;
            } else {
                var orderIdx = indexOfArr(order, topFolder);
                orderRank = (orderIdx === -1) ? Number.MAX_VALUE : categoryOrder.length + orderIdx;
            }

            if (!groups[categoryName]) {
                groups[categoryName] = { scripts: [], orderRank: orderRank };
            } else if (orderRank < groups[categoryName].orderRank) {
                groups[categoryName].orderRank = orderRank;
            }
            groups[categoryName].scripts.push({
                label: label,
                category: categoryName,
                relPath: relPath,
                rootIndex: item.rootIndex,
                thirdParty: thirdParty,
                modified: item.modified || 0
            });
        }

        var keys = [];
        for (var k in groups) { if (groups.hasOwnProperty(k)) keys.push(k); }

        keys.sort(function (a, b) {
            var ra = groups[a].orderRank, rb = groups[b].orderRank;
            if (ra === rb) {
                // 「その他」は常に最後
                if (a === OTHER_CATEGORY) return 1;
                if (b === OTHER_CATEGORY) return -1;
                return a < b ? -1 : (a > b ? 1 : 0);
            }
            return ra - rb;
        });

        var result = [];
        for (var j = 0; j < keys.length; j++) {
            var g = groups[keys[j]];
            g.scripts.sort(compareLabel);
            result.push({ category: keys[j], scripts: g.scripts });
        }
        return result;
    }

    // usage: { "相対パス": { count: number, last: number(ミリ秒) } }
    function usageScore(script, usage, config) {
        var key = scriptKey(script);
        var count = (usage && usage[key] && usage[key].count) || 0;
        var initial = lookup(config && config.initialUsage, key) || 0;
        return count + initial;
    }

    function lastUsed(script, usage) {
        var key = scriptKey(script);
        return (usage && usage[key] && usage[key].last) || 0;
    }

    function sortByUsage(scripts, usage, config) {
        var copy = scripts.slice(0);
        copy.sort(function (a, b) {
            var sa = usageScore(a, usage, config), sb = usageScore(b, usage, config);
            if (sa !== sb) return sb - sa;
            var la = lastUsed(a, usage), lb = lastUsed(b, usage);
            if (la !== lb) return lb - la;
            return compareLabel(a, b);
        });
        return copy;
    }

    // 各カテゴリ内を使用回数の多い順に並べ替えた新しい配列を返す
    function applyUsage(groups, usage, config) {
        var result = [];
        for (var i = 0; i < groups.length; i++) {
            result.push({ category: groups[i].category, scripts: sortByUsage(groups[i].scripts, usage, config) });
        }
        return result;
    }

    function flatten(groups) {
        var all = [], seen = {};
        for (var i = 0; i < groups.length; i++) {
            for (var j = 0; j < groups[i].scripts.length; j++) {
                var sc = groups[i].scripts[j];
                var id = sc.rootIndex + "|" + sc.relPath;
                if (seen[id]) continue;
                seen[id] = true;
                all.push(sc);
            }
        }
        return all;
    }

    // 「立ち上げ時」「よく使う」「最近追加・更新」を作る（空のものは省く）
    // 戻り値は buildScriptList と同じ形。nowMs を渡すとテストで日時を固定できる。
    function buildVirtualGroups(groups, usage, config, nowMs) {
        config = config || {};
        var all = flatten(groups);
        var result = [];

        // 立ち上げ時：config.startup に書いた順
        var startup = [];
        var startupList = config.startup || [];
        for (var s = 0; s < startupList.length; s++) {
            for (var a = 0; a < all.length; a++) {
                if (all[a].relPath === startupList[s] || baseName(all[a].relPath) === startupList[s]) {
                    if (!contains(startup, all[a])) startup.push(all[a]);
                }
            }
        }
        if (startup.length > 0) result.push({ category: STARTUP_CATEGORY, scripts: startup, virtual: true });

        // よく使う：使用回数（＋初期値）が1以上のものを多い順に
        var limit = config.frequentLimit || 12;
        var frequent = [];
        var sorted = sortByUsage(all, usage, config);
        var fx = config.frequentExclude || [];
        for (var f = 0; f < sorted.length && frequent.length < limit; f++) {
            if (listHas(fx, sorted[f].relPath) || contains(fx, sorted[f].category)) continue;
            if (usageScore(sorted[f], usage, config) > 0) frequent.push(sorted[f]);
        }
        if (frequent.length > 0) result.unshift({ category: FREQUENT_CATEGORY, scripts: frequent, virtual: true });

        // 最近追加・更新：更新日時が recentDays 以内のものを新しい順に
        var days = config.recentDays || 7;
        var now = nowMs || new Date().getTime();
        var recent = [];
        for (var r = 0; r < all.length; r++) {
            if (all[r].modified && now - all[r].modified <= days * DAY_MS) recent.push(all[r]);
        }
        recent.sort(function (x, y) { return y.modified - x.modified; });
        if (recent.length > 0) result.push({ category: RECENT_CATEGORY, scripts: recent, virtual: true });

        return result;
    }

    // ラベル・ファイル名の部分一致検索（大文字小文字・全角半角スペースを区別しない）
    function searchScripts(groups, query, usage, config, limit) {
        var q = String(query || "").replace(/[\s　]+/g, " ").replace(/^\s+|\s+$/g, "").toLowerCase();
        if (!q) return [];
        var words = q.split(" ");
        var all = flatten(groups);
        var hits = [];
        for (var i = 0; i < all.length; i++) {
            var hay = (all[i].label + " " + all[i].relPath).toLowerCase();
            var ok = true;
            for (var w = 0; w < words.length; w++) {
                if (hay.indexOf(words[w]) === -1) { ok = false; break; }
            }
            if (ok) hits.push(all[i]);
        }
        hits = sortByUsage(hits, usage, config);
        return hits.slice(0, limit || 30);
    }

    // 起動を記録した新しい usage を返す（元のオブジェクトは変更しない）
    function recordUse(usage, script, nowMs) {
        var next = {};
        for (var k in usage) { if (hasOwn(usage, k)) next[k] = { count: usage[k].count || 0, last: usage[k].last || 0 }; }
        var key = scriptKey(script);
        if (!next[key]) next[key] = { count: 0, last: 0 };
        next[key].count += 1;
        next[key].last = nowMs || new Date().getTime();
        return next;
    }

    // 複数フォルダの設定ファイルをまとめる。
    // オブジェクト項目は後のものが上書き、配列項目はつなげる、数値は後のもの優先。
    function mergeConfigs(configs) {
        var OBJ = ["categories", "fileCategories", "labels", "initialUsage"];
        var ARR = ["excludeDirs", "excludeFiles", "order", "categoryOrder", "startup", "frequentExclude"];
        var NUM = ["frequentLimit", "recentDays"];
        var out = {};
        for (var i = 0; i < configs.length; i++) {
            var c = configs[i];
            if (!c) continue;
            for (var o = 0; o < OBJ.length; o++) {
                var src = c[OBJ[o]];
                if (!src) continue;
                if (!out[OBJ[o]]) out[OBJ[o]] = {};
                for (var k in src) { if (hasOwn(src, k)) out[OBJ[o]][k] = src[k]; }
            }
            for (var a = 0; a < ARR.length; a++) {
                var list = c[ARR[a]];
                if (!list) continue;
                if (!out[ARR[a]]) out[ARR[a]] = [];
                for (var j = 0; j < list.length; j++) {
                    if (!contains(out[ARR[a]], list[j])) out[ARR[a]].push(list[j]);
                }
            }
            for (var n = 0; n < NUM.length; n++) {
                if (typeof c[NUM[n]] === "number") out[NUM[n]] = c[NUM[n]];
            }
        }
        return out;
    }

    var ns = {
        buildScriptList: buildScriptList,
        applyUsage: applyUsage,
        buildVirtualGroups: buildVirtualGroups,
        searchScripts: searchScripts,
        recordUse: recordUse,
        mergeConfigs: mergeConfigs,
        scriptKey: scriptKey,
        FREQUENT_CATEGORY: FREQUENT_CATEGORY,
        STARTUP_CATEGORY: STARTUP_CATEGORY,
        RECENT_CATEGORY: RECENT_CATEGORY
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = ns;
    } else {
        global.LauncherCore = ns;
    }

})(this);
