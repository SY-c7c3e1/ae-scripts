// main.js — Reference Viewer パネルの画面処理
//
// AEとのやり取りは host/ReferenceViewer.host.jsx の関数を evalScript で呼ぶ。
// 一覧の編集などの純粋なロジックは ReferenceViewer.core.js（ReferenceViewerCore）。
//
// 保存の流れ:
//   編集 → すぐにブラウザ側（localStorage）へバックアップ
//        → 少し待ってから .aep の XMP に書き込み（AEでプロジェクトを保存したときに確定）

(function () {
    "use strict";

    var Core = window.ReferenceViewerCore;
    var cep = window.__adobe_cep__;

    var POLL_MS = 1500;       // プロジェクト切り替えの確認間隔
    var WRITE_DELAY_MS = 400; // 編集してからXMPに書き込むまでの待ち時間

    var state = {
        projectPath: null,    // null = まだ読み込んでいない / "" = 未保存プロジェクト
        data: Core.createEmptyData(),
        resolved: {},         // id -> 実際に見つかったファイルパス（見つからなければ ""）
        selectedId: null,
        lastRemoved: null     // { item, index }（元に戻す用）
    };

    var $ = function (id) { return document.getElementById(id); };
    var el = {
        list: $("itemList"), emptyHint: $("emptyHint"), viewer: $("viewer"),
        memo: $("memo"), memoSection: $("memoSection"), memoToggle: $("memoToggle"), memoSaved: $("memoSaved"),
        status: $("status"), projectName: $("projectName"),
        linkForm: $("linkForm"), linkName: $("linkName"), linkUrl: $("linkUrl"),
        restoreBanner: $("restoreBanner"), contextMenu: $("contextMenu"), dropOverlay: $("dropOverlay")
    };

    // ---------- AEとのやり取り ----------

    function host(call, cb) {
        if (!cep) { if (cb) cb("ERR:AEの外で開かれています"); return; }
        cep.evalScript(call, function (r) { if (cb) cb(r); });
    }
    function isErr(r) { return typeof r !== "string" || r.indexOf("ERR:") === 0 || r === "EvalScript error."; }
    // evalScript に渡す文字列引数
    function arg(s) { return "\"" + encodeURIComponent(s).replace(/'/g, "%27") + "\""; }
    function dec(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }

    // ---------- ステータス表示 ----------

    var statusTimer = null;
    function setStatus(msg, opts) {
        opts = opts || {};
        el.status.className = "status" + (opts.error ? " error" : "");
        el.status.textContent = msg;
        if (opts.action) {
            var a = document.createElement("a");
            a.textContent = opts.action.label;
            a.onclick = function () { opts.action.fn(); setStatus(""); };
            el.status.appendChild(a);
        }
        clearTimeout(statusTimer);
        if (msg) statusTimer = setTimeout(function () { setStatus(""); }, opts.error ? 8000 : 5000);
    }

    // ---------- 保存 ----------

    function backupKey(path) { return "rv_backup:" + (path || "(untitled)"); }
    function backup() {
        try { localStorage.setItem(backupKey(state.projectPath), Core.serializeData(state.data)); } catch (e) { /* 使えなくても動作は続ける */ }
    }
    function readBackup(path) {
        try { return localStorage.getItem(backupKey(path)) || ""; } catch (e) { return ""; }
    }

    var writeTimer = null;
    function commit() {
        backup();
        clearTimeout(writeTimer);
        writeTimer = setTimeout(writeNow, WRITE_DELAY_MS);
    }

    function writeNow() {
        var forPath = state.projectPath;
        var s = Core.serializeData(state.data);
        // 書き込む前に、別のプロジェクトに切り替わっていないか確認
        host("rv_projectPath()", function (r) {
            if (isErr(r) || dec(r) !== forPath) return;
            host("rv_writeData(" + arg(s) + ")", function (res) {
                if (isErr(res)) { setStatus("保存に失敗しました: " + res.replace(/^ERR:/, ""), { error: true }); return; }
                el.memoSaved.textContent = "AEでプロジェクトを保存すると確定";
            });
        });
    }

    // ---------- プロジェクトの読み込み ----------

    function poll() {
        host("rv_projectPath()", function (r) {
            if (isErr(r)) return;
            var p = dec(r);
            if (p !== state.projectPath) loadProject(p);
        });
    }

    function loadProject(path) {
        clearTimeout(writeTimer); // 前のプロジェクト宛ての書き込みは取り消す（バックアップは残っている）
        state.projectPath = path;
        state.selectedId = null;
        state.lastRemoved = null;
        el.projectName.textContent = path ? Core.basename(path) : "（未保存のプロジェクト）";
        el.projectName.title = path;
        el.memoSaved.textContent = "";

        host("rv_readData()", function (r) {
            if (state.projectPath !== path) return;
            if (isErr(r)) { setStatus("読み込みに失敗しました: " + r.replace(/^ERR:/, ""), { error: true }); r = ""; }
            var saved = dec(r);
            state.data = Core.parseData(saved);
            el.memo.value = state.data.memo;

            // 保存せずに閉じた変更がバックアップに残っていれば復元を提案
            var bk = readBackup(path);
            var bkData = Core.parseData(bk);
            var bkHasContent = bkData.items.length > 0 || bkData.memo !== "";
            el.restoreBanner.hidden = !(bk && bkHasContent && bk !== Core.serializeData(state.data));

            refreshResolved();
        });
    }

    function restoreBackup() {
        state.data = Core.parseData(readBackup(state.projectPath));
        el.memo.value = state.data.memo;
        el.restoreBanner.hidden = true;
        commit();
        refreshResolved();
        setStatus("バックアップから復元しました");
    }

    function projectDir() {
        return state.projectPath ? Core.dirname(state.projectPath) : "";
    }

    // 各ファイルの実際の場所を確認してから描画する
    function refreshResolved() {
        var files = [], flat = [];
        state.data.items.forEach(function (it) {
            if (it.type !== "file") return;
            var c = Core.resolveCandidates(it, projectDir());
            files.push({ item: it, from: flat.length, count: c.length });
            flat = flat.concat(c);
        });
        if (flat.length === 0) { state.resolved = {}; render(); return; }

        var forPath = state.projectPath;
        host("rv_exists(" + arg(flat.join("\n")) + ")", function (r) {
            if (state.projectPath !== forPath) return;
            var ok = isErr(r) ? "" : r;
            state.resolved = {};
            files.forEach(function (f) {
                var found = "";
                for (var i = 0; i < f.count; i++) {
                    if (ok.charAt(f.from + i) === "1") { found = flat[f.from + i]; break; }
                }
                state.resolved[f.item.id] = found;
            });
            render();
        });
    }

    // ---------- 描画 ----------

    function iconFor(item) {
        if (item.type === "link") return "🔗";
        switch (Core.fileKind(item.path)) {
            case "image": return "🖼";
            case "pdf": return "📄";
            case "text": return "📝";
            default: return "📦";
        }
    }

    function render() {
        el.list.innerHTML = "";
        el.emptyHint.hidden = state.data.items.length > 0;

        state.data.items.forEach(function (item) {
            var li = document.createElement("li");
            li.dataset.id = item.id;
            li.draggable = true;
            var missing = item.type === "file" && state.resolved[item.id] === "";
            if (missing) li.classList.add("missing");
            if (item.id === state.selectedId) li.classList.add("selected");
            li.title = item.type === "link" ? item.url : (state.resolved[item.id] || item.path);

            var icon = document.createElement("span");
            icon.className = "icon";
            icon.textContent = iconFor(item);
            var name = document.createElement("span");
            name.className = "name";
            name.textContent = item.name;
            li.appendChild(icon);
            li.appendChild(name);
            if (missing) {
                var b = document.createElement("span");
                b.className = "badge";
                b.textContent = "見つかりません";
                li.appendChild(b);
            }

            li.addEventListener("click", function () { select(item.id); });
            li.addEventListener("dblclick", function () { openExternal(item); });
            li.addEventListener("contextmenu", function (e) {
                e.preventDefault();
                select(item.id);
                showContextMenu(item, e.clientX, e.clientY);
            });
            attachReorder(li, item);
            el.list.appendChild(li);
        });

        renderViewer();
    }

    function findItem(id) {
        for (var i = 0; i < state.data.items.length; i++) if (state.data.items[i].id === id) return state.data.items[i];
        return null;
    }

    function select(id) {
        if (state.selectedId === id) return;
        state.selectedId = id;
        Array.prototype.forEach.call(el.list.children, function (li) {
            li.classList.toggle("selected", li.dataset.id === id);
        });
        renderViewer();
    }

    function fileUrl(p) {
        var n = Core.normalizePath(p);
        var enc = n.split("/").map(function (seg, i) {
            return (i === 0 && /^[A-Za-z]:$/.test(seg)) ? seg : encodeURIComponent(seg);
        }).join("/");
        if (n.indexOf("//") === 0) return "file:" + enc;     // \\server\share
        if (n.charAt(0) === "/") return "file://" + enc;    // Mac
        return "file:///" + enc;                            // C:/...
    }

    function infoBox(title, lines, buttonLabel, onButton) {
        var box = document.createElement("div");
        box.className = "viewer-info";
        var t = document.createElement("div");
        t.className = "title";
        t.textContent = title;
        box.appendChild(t);
        lines.forEach(function (l) {
            var d = document.createElement("div");
            d.textContent = l;
            box.appendChild(d);
        });
        if (buttonLabel) {
            var b = document.createElement("button");
            b.textContent = buttonLabel;
            b.onclick = onButton;
            box.appendChild(b);
        }
        return box;
    }

    function renderViewer() {
        var v = el.viewer;
        v.innerHTML = "";
        var item = findItem(state.selectedId);
        if (!item) {
            var ph = document.createElement("div");
            ph.className = "viewer-placeholder";
            ph.textContent = state.data.items.length ? "一覧から選ぶとここに表示されます" : "";
            v.appendChild(ph);
            return;
        }
        if (item.type === "link") {
            v.appendChild(infoBox(item.name, [item.url], "ブラウザで開く", function () { openExternal(item); }));
            return;
        }
        var path = state.resolved[item.id];
        if (!path) {
            v.appendChild(infoBox("ファイルが見つかりません", [item.path]));
            return;
        }
        if (Core.fileKind(path) === "image") {
            var img = document.createElement("img");
            img.src = fileUrl(path);
            img.alt = item.name;
            img.draggable = false;
            v.appendChild(img);
            return;
        }
        // PDF・テキストのパネル内表示は次のステップで対応
        v.appendChild(infoBox(item.name, ["この形式はパネル内ではまだ表示できません"], "外部アプリで開く",
            function () { openExternal(item); }));
    }

    // ---------- 操作 ----------

    function openExternal(item) {
        if (item.type === "link") {
            if (window.cep && window.cep.util) window.cep.util.openURLInDefaultBrowser(item.url);
            else setStatus("ブラウザを開けませんでした", { error: true });
            return;
        }
        var path = state.resolved[item.id];
        if (!path) { setStatus("ファイルが見つかりません: " + item.path, { error: true }); return; }
        host("rv_openFile(" + arg(path) + ")", function (r) {
            if (isErr(r)) setStatus(r.replace(/^ERR:/, ""), { error: true });
        });
    }

    function revealFile(item) {
        var path = state.resolved[item.id];
        if (!path) { setStatus("ファイルが見つかりません: " + item.path, { error: true }); return; }
        host("rv_revealFile(" + arg(path) + ")", function (r) {
            if (isErr(r)) setStatus(r.replace(/^ERR:/, ""), { error: true });
        });
    }

    function addFilePaths(paths) {
        if (state.projectPath === null) return;
        var added = Core.addFiles(state.data, paths, projectDir());
        var skipped = paths.length - added.length;
        if (added.length) {
            state.selectedId = added[added.length - 1].id;
            commit();
            refreshResolved();
        }
        setStatus(added.length + " 件追加しました" + (skipped ? "（登録済みの " + skipped + " 件はスキップ）" : ""));
    }

    function removeItem(item) {
        var index = state.data.items.indexOf(item);
        Core.removeItem(state.data, item.id);
        state.lastRemoved = { item: item, index: index };
        if (state.selectedId === item.id) state.selectedId = null;
        commit();
        render();
        setStatus("「" + item.name + "」を一覧から外しました", { action: { label: "元に戻す", fn: undoRemove } });
    }

    function undoRemove() {
        var r = state.lastRemoved;
        if (!r) return;
        state.data.items.splice(Math.min(r.index, state.data.items.length), 0, r.item);
        state.lastRemoved = null;
        state.selectedId = r.item.id;
        commit();
        refreshResolved();
    }

    function startRename(item) {
        var li = el.list.querySelector('li[data-id="' + item.id + '"]');
        if (!li) return;
        var nameSpan = li.querySelector(".name");
        var input = document.createElement("input");
        input.type = "text";
        input.className = "rename";
        input.value = item.name;
        li.replaceChild(input, nameSpan);
        li.draggable = false;
        input.focus();
        input.select();

        var done = false;
        function finish(save) {
            if (done) return;
            done = true;
            if (save && Core.renameItem(state.data, item.id, input.value)) commit();
            render();
        }
        input.addEventListener("keydown", function (e) {
            if (e.key === "Enter") finish(true);
            else if (e.key === "Escape") finish(false);
            e.stopPropagation();
        });
        input.addEventListener("blur", function () { finish(true); });
        input.addEventListener("click", function (e) { e.stopPropagation(); });
    }

    // ---------- 右クリックメニュー ----------

    function showContextMenu(item, x, y) {
        var m = el.contextMenu;
        m.innerHTML = "";
        var entries = [
            [item.type === "link" ? "ブラウザで開く" : "外部アプリで開く", function () { openExternal(item); }],
            item.type === "file" ? ["フォルダを開く", function () { revealFile(item); }] : null,
            ["名前を変更", function () { startRename(item); }],
            "-",
            ["一覧から外す", function () { removeItem(item); }]
        ];
        entries.forEach(function (e) {
            if (!e) return;
            var li = document.createElement("li");
            if (e === "-") { li.className = "sep"; m.appendChild(li); return; }
            li.textContent = e[0];
            li.addEventListener("click", function () { hideContextMenu(); e[1](); });
            m.appendChild(li);
        });
        m.hidden = false;
        // 画面からはみ出さないように
        var w = m.offsetWidth, h = m.offsetHeight;
        m.style.left = Math.min(x, window.innerWidth - w - 4) + "px";
        m.style.top = Math.min(y, window.innerHeight - h - 4) + "px";
    }
    function hideContextMenu() { el.contextMenu.hidden = true; }
    document.addEventListener("mousedown", function (e) {
        if (!el.contextMenu.contains(e.target)) hideContextMenu();
    });

    // ---------- 並び替え（一覧内ドラッグ） ----------

    var draggingId = null;
    var REORDER_TYPE = "application/x-rv-item";

    function clearDropMarks() {
        Array.prototype.forEach.call(el.list.children, function (li) {
            li.classList.remove("drop-before", "drop-after");
        });
    }

    function attachReorder(li, item) {
        li.addEventListener("dragstart", function (e) {
            draggingId = item.id;
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData(REORDER_TYPE, item.id);
        });
        li.addEventListener("dragend", function () { draggingId = null; clearDropMarks(); });
        li.addEventListener("dragover", function (e) {
            if (!draggingId) return;
            e.preventDefault();
            var after = e.offsetY > li.offsetHeight / 2;
            clearDropMarks();
            li.classList.add(after ? "drop-after" : "drop-before");
        });
        li.addEventListener("drop", function (e) {
            if (!draggingId) return;
            e.preventDefault();
            e.stopPropagation();
            var after = e.offsetY > li.offsetHeight / 2;
            var from = state.data.items.indexOf(findItem(draggingId));
            var target = state.data.items.indexOf(item) + (after ? 1 : 0);
            if (from < target) target--; // 自分が抜けた分ずれる
            if (Core.moveItem(state.data, draggingId, target)) { commit(); render(); }
            draggingId = null;
            clearDropMarks();
        });
    }

    // ---------- エクスプローラー/Finderからのドロップ ----------

    function isExternalFileDrag(e) {
        if (draggingId) return false;
        var types = e.dataTransfer && e.dataTransfer.types;
        return types && Array.prototype.indexOf.call(types, "Files") !== -1;
    }

    var dragDepth = 0;
    document.addEventListener("dragenter", function (e) {
        if (!isExternalFileDrag(e)) return;
        dragDepth++;
        el.dropOverlay.hidden = false;
    });
    document.addEventListener("dragleave", function (e) {
        if (!isExternalFileDrag(e)) return;
        dragDepth = Math.max(0, dragDepth - 1);
        if (dragDepth === 0) el.dropOverlay.hidden = true;
    });
    // これが無いとドロップしたファイルでパネル自体が置き換わってしまう
    document.addEventListener("dragover", function (e) { e.preventDefault(); });
    document.addEventListener("drop", function (e) {
        e.preventDefault();
        dragDepth = 0;
        el.dropOverlay.hidden = true;
        if (draggingId) return;
        var files = e.dataTransfer && e.dataTransfer.files;
        if (!files || !files.length) return;
        var paths = [];
        for (var i = 0; i < files.length; i++) if (files[i].path) paths.push(files[i].path);
        if (!paths.length) {
            setStatus("ドロップしたファイルの場所を取得できませんでした。「＋ファイル」から追加してください", { error: true });
            return;
        }
        addFilePaths(paths);
    });

    // ---------- ツールバー ----------

    $("btnAddFile").addEventListener("click", function () {
        host("rv_selectFiles()", function (r) {
            if (isErr(r)) { setStatus(r.replace(/^ERR:/, ""), { error: true }); return; }
            if (!r) return;
            addFilePaths(dec(r).split("\n"));
        });
    });

    $("btnAddLink").addEventListener("click", function () {
        el.linkForm.hidden = !el.linkForm.hidden;
        if (!el.linkForm.hidden) el.linkUrl.focus();
    });
    $("linkCancel").addEventListener("click", function () { el.linkForm.hidden = true; });
    el.linkForm.addEventListener("submit", function (e) {
        e.preventDefault();
        if (state.projectPath === null) return;
        var item = Core.addLink(state.data, el.linkName.value, el.linkUrl.value);
        if (!item) { el.linkUrl.focus(); return; }
        el.linkName.value = "";
        el.linkUrl.value = "";
        el.linkForm.hidden = true;
        state.selectedId = item.id;
        commit();
        render();
        setStatus("リンクを追加しました");
    });

    $("btnRestore").addEventListener("click", restoreBackup);
    $("btnRestoreDismiss").addEventListener("click", function () { el.restoreBanner.hidden = true; });

    // ---------- メモ ----------

    el.memo.addEventListener("input", function () {
        if (state.projectPath === null) return;
        state.data.memo = el.memo.value;
        commit();
    });

    function setMemoOpen(open) {
        el.memoSection.classList.toggle("collapsed", !open);
        el.memoToggle.textContent = open ? "▼" : "▶";
        try { localStorage.setItem("rv_memoOpen", open ? "1" : "0"); } catch (e) { /* noop */ }
    }
    $("memoHeader").addEventListener("click", function () {
        setMemoOpen(el.memoSection.classList.contains("collapsed"));
    });
    (function () {
        var open = "1";
        try { open = localStorage.getItem("rv_memoOpen") || "1"; } catch (e) { /* noop */ }
        setMemoOpen(open === "1");
    })();

    // ---------- AEの配色に合わせる ----------

    function applyTheme() {
        if (!cep) return;
        try {
            var env = JSON.parse(cep.getHostEnvironment());
            var c = env.appSkinInfo.panelBackgroundColor.color;
            var shift = function (d) {
                return "rgb(" + [c.red, c.green, c.blue].map(function (v) {
                    return Math.max(0, Math.min(255, Math.round(v + d)));
                }).join(",") + ")";
            };
            var root = document.documentElement.style;
            root.setProperty("--bg", shift(0));
            root.setProperty("--bg2", shift(9));
            root.setProperty("--bg3", shift(21));
        } catch (e) { /* 既定の色のまま */ }
    }

    // ---------- 開始 ----------

    applyTheme();
    render();
    if (!cep) {
        setStatus("AEの外で開かれています（表示確認用）");
        state.projectPath = "";
    } else {
        poll();
        setInterval(poll, POLL_MS);
    }
})();
