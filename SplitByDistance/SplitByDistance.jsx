// SplitByDistance.jsx
// 距離ベースのレイヤー自動分割ツール v1
//
// 概要：
//   コンポ内に散らばって配置されたレイヤー（添付画像のような、離れた図形の集合）を
//   「近くにあるもの同士」でグループ化し、グループ（＝離れたオブジェクト）ごとに
//   新規コンポジションへ自動で振り分けるスクリプト。
//
// 使い方：
//   1. 対象コンポを開く（必要なら対象レイヤーを選択）
//   2. しきい値・余白などを設定して [実行]
//   3. グループごとに新規コンポが作成され、そこへレイヤーがコピーされる
//
// 判定方法：
//   各レイヤーのバウンディングボックス（コンプ座標系）を求め、
//   ボックス間の最短距離が「しきい値」以下のものを同一グループとして連結する
//   （Union-Find によるクラスタリング）。
//
// 制限事項：
//   ・判定は現在の再生ヘッド位置（comp.time）のバウンディングボックスで行う
//   ・3Dレイヤーは X/Y と Z回転のみを考慮した簡易的な2D近似
//   ・親子関係が異なるグループにまたがる場合、自動位置調整はスキップされる
//     （警告として一覧表示されるので、該当レイヤーは手動で確認してください）
//   ・Position にエクスプレッションが設定されている場合も自動位置調整はスキップされる

(function () {

    // ============================================================
    // ユーティリティ
    // ============================================================

    function getActiveComp() {
        var c = app.project.activeItem;
        return (c && c instanceof CompItem) ? c : null;
    }

    function arr3(v) {
        return [v[0], v[1], (v.length > 2 ? v[2] : 0)];
    }

    function pad(n, width) {
        var s = "" + n;
        while (s.length < width) s = "0" + s;
        return s;
    }

    function isTargetLayer(layer, includeHidden) {
        if (!(layer instanceof AVLayer)) return false;
        if (layer.nullLayer) return false;
        if (layer.guideLayer) return false;
        if (layer.adjustmentLayer) return false;
        if (!includeHidden && !layer.enabled) return false;
        return true;
    }

    // ── レイヤーのトランスフォーム値取得（言語非依存のショートカットプロパティを使用） ──

    function getAnchorAtTime(layer, time) {
        try { return arr3(layer.anchorPoint.valueAtTime(time, false)); } catch (e) { return [0, 0, 0]; }
    }

    function getScaleAtTime(layer, time) {
        try { return arr3(layer.scale.valueAtTime(time, false)); } catch (e) { return [100, 100, 100]; }
    }

    function getRotationZAtTime(layer, time) {
        try {
            if (layer.threeDLayer) return layer.rotationZ.valueAtTime(time, false);
            return layer.rotation.valueAtTime(time, false);
        } catch (e) { return 0; }
    }

    function getPositionAtTime(layer, time) {
        try {
            return arr3(layer.position.valueAtTime(time, false));
        } catch (e) {
            // Position が Separate Dimensions されている場合
            try {
                var x = layer.xPosition.valueAtTime(time, false);
                var y = layer.yPosition.valueAtTime(time, false);
                var z = 0;
                try { z = layer.zPosition.valueAtTime(time, false); } catch (e2) {}
                return [x, y, z];
            } catch (e3) {
                return [0, 0, 0];
            }
        }
    }

    function isPositionExpressionEnabled(layer) {
        try {
            return layer.position.expressionEnabled;
        } catch (e) {
            try {
                return layer.xPosition.expressionEnabled || layer.yPosition.expressionEnabled;
            } catch (e2) {
                return false;
            }
        }
    }

    // レイヤーのローカル座標点を、親チェーンをたどってコンプ座標へ変換（2D近似）
    function layerLocalToComp(layer, localPt, time) {
        var cur = layer;
        var p = [localPt[0], localPt[1]];
        var guard = 0;
        var used3D = false;

        while (cur && guard < 50) {
            guard++;
            if (cur.threeDLayer) used3D = true;

            var anchor = getAnchorAtTime(cur, time);
            var pos    = getPositionAtTime(cur, time);
            var scale  = getScaleAtTime(cur, time);
            var rot    = getRotationZAtTime(cur, time);

            var x = p[0] - anchor[0];
            var y = p[1] - anchor[1];

            x *= (scale[0] / 100);
            y *= (scale[1] / 100);

            if (rot) {
                var rad = rot * Math.PI / 180;
                var cosR = Math.cos(rad), sinR = Math.sin(rad);
                var rx = x * cosR - y * sinR;
                var ry = x * sinR + y * cosR;
                x = rx; y = ry;
            }

            x += pos[0];
            y += pos[1];

            p = [x, y];
            cur = cur.parent;
        }

        return { point: p, used3D: used3D };
    }

    // レイヤーのコンプ座標系でのバウンディングボックスを取得
    function getLayerAabbInComp(layer, time) {
        var rect;
        try { rect = layer.sourceRectAtTime(time, false); } catch (e) { return null; }
        if (!rect) return null;

        var corners = [
            [rect.left, rect.top],
            [rect.left + rect.width, rect.top],
            [rect.left, rect.top + rect.height],
            [rect.left + rect.width, rect.top + rect.height]
        ];

        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        var used3D = false;

        for (var i = 0; i < corners.length; i++) {
            var r = layerLocalToComp(layer, corners[i], time);
            if (r.used3D) used3D = true;
            var px = r.point[0], py = r.point[1];
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
        }

        return { left: minX, top: minY, right: maxX, bottom: maxY, used3D: used3D };
    }

    // ── ボックス間距離（重なっている/接している場合は0） ──
    function boxDistance(a, b) {
        var dx = Math.max(a.left - b.right, b.left - a.right, 0);
        var dy = Math.max(a.top - b.bottom, b.top - a.bottom, 0);
        if (dx === 0 && dy === 0) return 0;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // ── Union-Find ──
    function ufFind(parent, i) {
        while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
        return i;
    }
    function ufUnion(parent, rank, a, b) {
        var ra = ufFind(parent, a), rb = ufFind(parent, b);
        if (ra === rb) return;
        if (rank[ra] < rank[rb]) { parent[ra] = rb; }
        else if (rank[ra] > rank[rb]) { parent[rb] = ra; }
        else { parent[rb] = ra; rank[ra]++; }
    }

    // ── レイヤー位置のオフセット（Position のキーフレーム/値を一括シフト） ──
    function shiftVectorProp(prop, offX, offY) {
        if (prop.numKeys > 0) {
            for (var k = 1; k <= prop.numKeys; k++) {
                var v = prop.keyValue(k);
                var nv = [v[0] - offX, v[1] - offY];
                if (v.length > 2) nv.push(v[2]);
                prop.setValueAtKey(k, nv);
            }
        } else {
            var v2 = prop.value;
            var nv2 = [v2[0] - offX, v2[1] - offY];
            if (v2.length > 2) nv2.push(v2[2]);
            prop.setValue(nv2);
        }
    }

    function shiftScalarProp(prop, off) {
        if (prop.numKeys > 0) {
            for (var k = 1; k <= prop.numKeys; k++) prop.setValueAtKey(k, prop.keyValue(k) - off);
        } else {
            prop.setValue(prop.value - off);
        }
    }

    function offsetLayerPosition(layer, offX, offY) {
        try {
            shiftVectorProp(layer.position, offX, offY);
        } catch (e) {
            try { shiftScalarProp(layer.xPosition, offX); } catch (e1) {}
            try { shiftScalarProp(layer.yPosition, offY); } catch (e2) {}
        }
    }

    // ============================================================
    // UI
    // ============================================================

    var dlg = new Window("palette", "Split By Distance", undefined, { resizeable: false });
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "top"];
    dlg.spacing = 10;
    dlg.margins = [14, 14, 14, 14];

    var lblDesc = dlg.add("statictext", undefined, "離れたレイヤーをグループごとに別コンポへ分割します。", { multiline: false });

    // ── 対象 ──
    var secTarget = dlg.add("panel", undefined, "  対象");
    secTarget.orientation = "column";
    secTarget.alignChildren = ["fill", "top"];
    secTarget.margins = [10, 14, 10, 10];
    secTarget.spacing = 5;

    var chkSelectedOnly = secTarget.add("checkbox", undefined, "選択レイヤーのみを対象にする");
    var chkIncludeHidden = secTarget.add("checkbox", undefined, "非表示レイヤーを含める");
    chkSelectedOnly.value = false;
    chkIncludeHidden.value = false;

    // ── 分割設定 ──
    var secSplit = dlg.add("panel", undefined, "  分割設定");
    secSplit.orientation = "column";
    secSplit.alignChildren = ["fill", "top"];
    secSplit.margins = [10, 14, 10, 10];
    secSplit.spacing = 6;

    var rowThresh = secSplit.add("group");
    rowThresh.alignment = "fill";
    rowThresh.add("statictext", undefined, "しきい値 (px)：");
    var txtThreshold = rowThresh.add("edittext", undefined, "80");
    txtThreshold.characters = 6;

    var rowMargin = secSplit.add("group");
    rowMargin.alignment = "fill";
    rowMargin.add("statictext", undefined, "余白 (px)：");
    var txtMargin = rowMargin.add("edittext", undefined, "40");
    txtMargin.characters = 6;

    var rowPrefix = secSplit.add("group");
    rowPrefix.alignment = "fill";
    rowPrefix.add("statictext", undefined, "コンプ名の接頭辞：");
    var txtPrefix = rowPrefix.add("edittext", undefined, "");
    txtPrefix.characters = 16;
    txtPrefix.helpTip = "空欄の場合はアクティブコンプ名を使用します";

    var chkFolder = secSplit.add("checkbox", undefined, "生成したコンポをフォルダにまとめる");
    chkFolder.value = true;

    // ── オプション ──
    var secOpt = dlg.add("panel", undefined, "  オプション");
    secOpt.orientation = "column";
    secOpt.alignChildren = ["fill", "top"];
    secOpt.margins = [10, 14, 10, 10];
    secOpt.spacing = 5;

    var chkDelete = secOpt.add("checkbox", undefined, "元レイヤーを削除する（移動モード）");
    chkDelete.value = false;
    chkDelete.helpTip = "OFF: 元コンポのレイヤーはそのまま残ります（複製）\nON: 新規コンポへコピー後、元レイヤーを削除します（移動）";

    // ── 実行 / 閉じる ──
    var runGroup = dlg.add("group");
    runGroup.alignment = "fill";
    runGroup.spacing = 8;
    var btnRun = runGroup.add("button", undefined, "実行");
    var btnClose = runGroup.add("button", undefined, "閉じる");

    // ============================================================
    // メイン処理
    // ============================================================

    btnRun.onClick = function () {
        var comp = getActiveComp();
        if (!comp) { alert("アクティブなコンポジションを開いてください。"); return; }

        var threshold = parseFloat(txtThreshold.text);
        if (isNaN(threshold) || threshold < 0) { alert("しきい値には0以上の数値を入力してください。"); return; }

        var margin = parseFloat(txtMargin.text);
        if (isNaN(margin) || margin < 0) { alert("余白には0以上の数値を入力してください。"); return; }

        var includeHidden = chkIncludeHidden.value;
        var selectedOnly  = chkSelectedOnly.value;

        // ── 対象レイヤー収集 ──
        var candidates = [];
        if (selectedOnly) {
            var sel = comp.selectedLayers;
            if (!sel || sel.length === 0) { alert("レイヤーが選択されていません。\n先に対象レイヤーを選択するか、「選択レイヤーのみを対象にする」のチェックを外してください。"); return; }
            for (var s = 0; s < sel.length; s++) {
                if (isTargetLayer(sel[s], includeHidden)) candidates.push(sel[s]);
            }
        } else {
            for (var li = 1; li <= comp.numLayers; li++) {
                var l = comp.layer(li);
                if (isTargetLayer(l, includeHidden)) candidates.push(l);
            }
        }

        if (candidates.length === 0) { alert("対象になるレイヤーが見つかりませんでした。\n（Null / ガイド / 調整レイヤーは対象外です）"); return; }

        var time = comp.time;

        // ── バウンディングボックス計算 ──
        var items = []; // {layer, index, box, used3D}
        var skipped = [];
        for (var c = 0; c < candidates.length; c++) {
            var lyr = candidates[c];
            var box = getLayerAabbInComp(lyr, time);
            if (!box) { skipped.push(lyr.name); continue; }
            items.push({ layer: lyr, index: lyr.index, box: box, used3D: box.used3D });
        }

        if (items.length === 0) { alert("バウンディングボックスを取得できるレイヤーがありませんでした。"); return; }

        // ── クラスタリング（Union-Find） ──
        var n = items.length;
        var parent = [], rank = [];
        for (var pi = 0; pi < n; pi++) { parent[pi] = pi; rank[pi] = 0; }

        for (var a = 0; a < n; a++) {
            for (var b = a + 1; b < n; b++) {
                if (boxDistance(items[a].box, items[b].box) <= threshold) {
                    ufUnion(parent, rank, a, b);
                }
            }
        }

        var groupsMap = {}; // root -> [itemIndex...]
        for (var gi = 0; gi < n; gi++) {
            var root = ufFind(parent, gi);
            if (!groupsMap[root]) groupsMap[root] = [];
            groupsMap[root].push(gi);
        }
        var clusters = [];
        for (var key in groupsMap) {
            if (groupsMap.hasOwnProperty(key)) clusters.push(groupsMap[key]);
        }

        // ── 確認 ──
        var modeLabel = chkDelete.value ? "移動（元レイヤーは削除されます）" : "複製（元レイヤーは残ります）";
        var proceed = confirm(
            "【Split By Distance】\n" +
            "対象レイヤー数: " + items.length + (skipped.length ? "（除外 " + skipped.length + "件）" : "") + "\n" +
            "検出グループ数: " + clusters.length + "\n" +
            "しきい値: " + threshold + "px / 余白: " + margin + "px\n" +
            "モード: " + modeLabel + "\n\n" +
            "続行しますか？"
        );
        if (!proceed) return;

        var prefix = (txtPrefix.text && txtPrefix.text.replace(/^\s+|\s+$/g, "") !== "") ? txtPrefix.text.replace(/^\s+|\s+$/g, "") : comp.name;
        var digits = Math.max(2, ("" + clusters.length).length);

        var warnings = [];
        var toDelete = [];
        var createdComps = 0;

        app.beginUndoGroup("Split By Distance");
        try {
            var targetFolder = null;
            if (chkFolder.value) {
                targetFolder = app.project.items.addFolder(prefix + " - Split");
            }

            for (var idx = 0; idx < clusters.length; idx++) {
                var clusterItemIdxs = clusters[idx];

                // クラスタのバウンディングボックスを合算
                var ub = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
                for (var u = 0; u < clusterItemIdxs.length; u++) {
                    var bx = items[clusterItemIdxs[u]].box;
                    if (bx.left   < ub.left)   ub.left   = bx.left;
                    if (bx.top    < ub.top)    ub.top    = bx.top;
                    if (bx.right  > ub.right)  ub.right  = bx.right;
                    if (bx.bottom > ub.bottom) ub.bottom = bx.bottom;
                }

                var compW = Math.min(30000, Math.max(1, Math.ceil((ub.right - ub.left) + margin * 2)));
                var compH = Math.min(30000, Math.max(1, Math.ceil((ub.bottom - ub.top) + margin * 2)));
                var offsetX = ub.left - margin;
                var offsetY = ub.top - margin;

                var compName = prefix + "_" + pad(idx + 1, digits);
                var newComp = app.project.items.addComp(compName, compW, compH, comp.pixelAspect, comp.duration, comp.frameRate);
                newComp.bgColor = comp.bgColor;
                if (targetFolder) newComp.parentFolder = targetFolder;

                // 元のスタック順を保つため、下（index大）から上（index小）の順にコピー
                var sortedItemIdxs = clusterItemIdxs.slice(0);
                sortedItemIdxs.sort(function (x, y) { return items[y].index - items[x].index; });

                for (var si = 0; si < sortedItemIdxs.length; si++) {
                    var itemRef = items[sortedItemIdxs[si]];
                    var srcLayer = itemRef.layer;

                    if (itemRef.used3D) {
                        warnings.push(srcLayer.name + "：3Dレイヤーのため簡易的な2D近似で計算しています。位置を確認してください。");
                    }

                    srcLayer.copyToComp(newComp);
                    var newLayer = newComp.layer(1);

                    var hasParent = false;
                    try { hasParent = !!newLayer.parent; } catch (eP) { hasParent = false; }

                    if (hasParent) {
                        warnings.push(srcLayer.name + "：親レイヤーが設定されているため自動位置調整をスキップしました。ズレを確認してください。");
                    } else if (isPositionExpressionEnabled(newLayer)) {
                        warnings.push(srcLayer.name + "：Position にエクスプレッションが設定されているため自動位置調整をスキップしました。");
                    } else {
                        offsetLayerPosition(newLayer, offsetX, offsetY);
                    }

                    if (chkDelete.value) toDelete.push(srcLayer);
                }

                newComp.selected = true;
                createdComps++;
            }

            // 移動モード：元レイヤーを削除（全コピー完了後にまとめて実行）
            if (chkDelete.value) {
                for (var d = 0; d < toDelete.length; d++) {
                    try { toDelete[d].remove(); } catch (eD) {}
                }
            }
        } finally {
            app.endUndoGroup();
        }

        var msg = "✅ 完了しました。\n\n" +
            "検出グループ数: " + clusters.length + "\n" +
            "作成したコンポ数: " + createdComps + "\n" +
            "対象レイヤー数: " + items.length +
            (skipped.length ? "\n除外レイヤー数: " + skipped.length : "");

        if (warnings.length > 0) {
            var shown = warnings.length > 15 ? warnings.slice(0, 15) : warnings;
            msg += "\n\n⚠ 要確認 (" + warnings.length + "件):\n" + shown.join("\n");
            if (warnings.length > shown.length) msg += "\n…他 " + (warnings.length - shown.length) + "件";
        }

        alert(msg);
    };

    btnClose.onClick = function () { dlg.close(); };

    dlg.center();
    dlg.show();

})();
