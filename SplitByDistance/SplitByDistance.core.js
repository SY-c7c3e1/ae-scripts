// SplitByDistance.core.js
// SplitByDistance のロジック本体（UI・AEオブジェクト非依存）。
//
// ExtendScript側（SplitByDistance.jsx）からは #include で読み込み、
// テスト側（__tests__/SplitByDistance.core.test.js）からは Node の require() で読み込む。
// そのため、実際の AVLayer / Property オブジェクトを直接受け取ることはせず、
// 必要な値はすべて素の配列・オブジェクト・関数として引数で受け取る。
//
// 例：レイヤーの親子チェーンをたどる処理は、.jsx側で
//   [{ anchor:[x,y,z], position:[x,y,z], scale:[x,y,z], rotation:number, threeDLayer:bool }, ...]
// という素の配列に変換してから渡す（transformPointThroughChain / aabbFromLocalRect）。

(function (global) {

    function arr3(v) {
        return [v[0], v[1], (v.length > 2 ? v[2] : 0)];
    }

    function pad(n, width) {
        var s = "" + n;
        while (s.length < width) s = "0" + s;
        return s;
    }

    function digitsForCount(count) {
        return Math.max(2, ("" + count).length);
    }

    function buildCompName(prefix, oneBasedIndex, digits) {
        return prefix + "_" + pad(oneBasedIndex, digits);
    }

    // ============================================================
    // 座標変換（親チェーンをたどってレイヤーローカル座標をコンプ座標へ）
    // ============================================================

    // chain: [{anchor:[x,y,z], position:[x,y,z], scale:[x,y,z], rotation:number, threeDLayer:bool}, ...]
    //        chain[0] が対象レイヤー自身、chain[1] がその親、…という順。
    function transformPointThroughChain(chain, localPt) {
        var p = [localPt[0], localPt[1]];
        var used3D = false;

        for (var i = 0; i < chain.length; i++) {
            var t = chain[i];
            if (t.threeDLayer) used3D = true;

            var x = p[0] - t.anchor[0];
            var y = p[1] - t.anchor[1];

            x *= (t.scale[0] / 100);
            y *= (t.scale[1] / 100);

            var rot = t.rotation || 0;
            if (rot) {
                var rad = rot * Math.PI / 180;
                var cosR = Math.cos(rad), sinR = Math.sin(rad);
                var rx = x * cosR - y * sinR;
                var ry = x * sinR + y * cosR;
                x = rx; y = ry;
            }

            x += t.position[0];
            y += t.position[1];

            p = [x, y];
        }

        return { point: p, used3D: used3D };
    }

    // localRect: {left, top, right, bottom}（レイヤーローカル座標系）
    function aabbFromLocalRect(chain, localRect) {
        var corners = [
            [localRect.left, localRect.top],
            [localRect.right, localRect.top],
            [localRect.left, localRect.bottom],
            [localRect.right, localRect.bottom]
        ];

        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        var used3D = false;

        for (var i = 0; i < corners.length; i++) {
            var r = transformPointThroughChain(chain, corners[i]);
            if (r.used3D) used3D = true;
            var px = r.point[0], py = r.point[1];
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
        }

        return { left: minX, top: minY, right: maxX, bottom: maxY, used3D: used3D };
    }

    // ============================================================
    // マスク単位モード：マスクの頂点からバウンディングボックスを求める
    // ============================================================

    // vertices: [[x,y], ...]（レイヤーローカル座標系。マスクパスの頂点）
    function bboxFromVertices(vertices) {
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (var v = 0; v < vertices.length; v++) {
            var px = vertices[v][0], py = vertices[v][1];
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
        }
        return { left: minX, top: minY, right: maxX, bottom: maxY };
    }

    // ============================================================
    // クラスタリング（距離ベース Union-Find）
    // ============================================================

    function boxDistance(a, b) {
        var dx = Math.max(a.left - b.right, b.left - a.right, 0);
        var dy = Math.max(a.top - b.bottom, b.top - a.bottom, 0);
        if (dx === 0 && dy === 0) return 0;
        return Math.sqrt(dx * dx + dy * dy);
    }

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

    // boxes: [{left,top,right,bottom}, ...]
    // 戻り値: クラスタの配列。各クラスタは boxes への添字の配列。
    function clusterByDistance(boxes, threshold) {
        var n = boxes.length;
        var parent = [], rank = [];
        for (var i = 0; i < n; i++) { parent[i] = i; rank[i] = 0; }

        for (var a = 0; a < n; a++) {
            for (var b = a + 1; b < n; b++) {
                if (boxDistance(boxes[a], boxes[b]) <= threshold) {
                    ufUnion(parent, rank, a, b);
                }
            }
        }

        var groupsMap = {};
        for (var g = 0; g < n; g++) {
            var root = ufFind(parent, g);
            if (!groupsMap[root]) groupsMap[root] = [];
            groupsMap[root].push(g);
        }
        var clusters = [];
        for (var key in groupsMap) {
            if (groupsMap.hasOwnProperty(key)) clusters.push(groupsMap[key]);
        }
        return clusters;
    }

    // indexes（boxesへの添字配列）が指すボックス群の外接矩形
    function unionBox(boxes, indexes) {
        var ub = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
        for (var i = 0; i < indexes.length; i++) {
            var bx = boxes[indexes[i]];
            if (bx.left   < ub.left)   ub.left   = bx.left;
            if (bx.top    < ub.top)    ub.top    = bx.top;
            if (bx.right  > ub.right)  ub.right  = bx.right;
            if (bx.bottom > ub.bottom) ub.bottom = bx.bottom;
        }
        return ub;
    }

    // 新規コンプのサイズ（1..maxSizeにクランプ）とオフセットを計算
    function computeCompLayout(ub, margin, maxSize) {
        var width  = Math.min(maxSize, Math.max(1, Math.ceil((ub.right - ub.left) + margin * 2)));
        var height = Math.min(maxSize, Math.max(1, Math.ceil((ub.bottom - ub.top) + margin * 2)));
        return {
            width: width,
            height: height,
            offsetX: ub.left - margin,
            offsetY: ub.top - margin
        };
    }

    // items: [{index, ...}, ...] / itemIndexesInCluster: items への添字配列
    // 同じ index（＝同じレイヤー）が複数の item から参照されていても1回だけ扱い、
    // 元のスタック順を保つため index 降順（下＝index大 → 上＝index小の順にコピーする用途）で返す
    function uniqueIndexesDescending(itemIndexesInCluster, items) {
        var seen = {};
        var result = [];
        for (var i = 0; i < itemIndexesInCluster.length; i++) {
            var idxVal = items[itemIndexesInCluster[i]].index;
            if (seen[idxVal]) continue;
            seen[idxVal] = true;
            result.push(idxVal);
        }
        result.sort(function (x, y) { return y - x; });
        return result;
    }

    // ============================================================
    // ピクセル単位モード：グリッド判定によるオブジェクト検出
    // ============================================================
    // ※ detect-objects.js（Node）側では画像の全ピクセルを1マス=1pxとして
    //   blobsFromForegroundGrid を呼ぶため、間引き用の computeGridStep は不要。

    // 0..1 の [r,g,b] 同士のチェビシェフ距離（最大チャンネル差）
    function colorDistance(sample, bg) {
        var dr = Math.abs(sample[0] - bg[0]);
        var dg = Math.abs(sample[1] - bg[1]);
        var db = Math.abs(sample[2] - bg[2]);
        return Math.max(dr, dg, db);
    }

    // sample: [r,g,b,a] (0..1) / opts: {useAlpha, bgColor:[r,g,b], alphaThreshold, colorTolerance}
    function classifySample(sample, opts) {
        if (sample[3] <= opts.alphaThreshold) return false;
        if (opts.useAlpha) return true;
        return colorDistance(sample, opts.bgColor) > opts.colorTolerance;
    }

    // fg: 前景判定済みの boolean 配列（長さ cols*rows、行優先 = y*cols+x）
    // rect: {left, top, width, height}（レイヤーローカル座標系。グリッドの原点）
    // 戻り値: レイヤーローカル座標系の矩形配列 [{left,top,right,bottom}, ...]（8近傍で連結）
    function blobsFromForegroundGrid(fg, cols, rows, rect, step) {
        function idx(x, y) { return y * cols + x; }

        var n = cols * rows;
        var parent = [], rank = [];
        for (var k = 0; k < n; k++) { parent[k] = k; rank[k] = 0; }

        for (var y = 0; y < rows; y++) {
            for (var x = 0; x < cols; x++) {
                if (!fg[idx(x, y)]) continue;
                var cand = [[x + 1, y], [x, y + 1], [x + 1, y + 1], [x - 1, y + 1]];
                for (var ci = 0; ci < cand.length; ci++) {
                    var nx = cand[ci][0], ny = cand[ci][1];
                    if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
                    if (fg[idx(nx, ny)]) ufUnion(parent, rank, idx(x, y), idx(nx, ny));
                }
            }
        }

        var groups = {};
        for (var y2 = 0; y2 < rows; y2++) {
            for (var x2 = 0; x2 < cols; x2++) {
                if (!fg[idx(x2, y2)]) continue;
                var root = ufFind(parent, idx(x2, y2));
                if (!groups[root]) groups[root] = { minX: x2, minY: y2, maxX: x2, maxY: y2 };
                else {
                    var gEntry = groups[root];
                    if (x2 < gEntry.minX) gEntry.minX = x2;
                    if (x2 > gEntry.maxX) gEntry.maxX = x2;
                    if (y2 < gEntry.minY) gEntry.minY = y2;
                    if (y2 > gEntry.maxY) gEntry.maxY = y2;
                }
            }
        }

        var maxRight  = rect.left + rect.width;
        var maxBottom = rect.top + rect.height;
        var blobs = [];
        for (var gk in groups) {
            if (!groups.hasOwnProperty(gk)) continue;
            var gg = groups[gk];
            blobs.push({
                left:   rect.left + gg.minX * step,
                top:    rect.top  + gg.minY * step,
                right:  Math.min(maxRight,  rect.left + (gg.maxX + 1) * step),
                bottom: Math.min(maxBottom, rect.top  + (gg.maxY + 1) * step)
            });
        }
        return blobs;
    }

    // ============================================================
    // Position プロパティのオフセット（キーフレーム/値を一括シフト）
    // prop: {numKeys, keyValue(k), setValueAtKey(k,v), value, setValue(v)} を持つオブジェクト
    // （実AEのPropertyオブジェクト、またはそれと同じ形のモック）
    // ============================================================

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

    var ns = {
        arr3: arr3,
        pad: pad,
        digitsForCount: digitsForCount,
        buildCompName: buildCompName,
        transformPointThroughChain: transformPointThroughChain,
        aabbFromLocalRect: aabbFromLocalRect,
        bboxFromVertices: bboxFromVertices,
        boxDistance: boxDistance,
        ufFind: ufFind,
        ufUnion: ufUnion,
        clusterByDistance: clusterByDistance,
        unionBox: unionBox,
        computeCompLayout: computeCompLayout,
        uniqueIndexesDescending: uniqueIndexesDescending,
        colorDistance: colorDistance,
        classifySample: classifySample,
        blobsFromForegroundGrid: blobsFromForegroundGrid,
        shiftVectorProp: shiftVectorProp,
        shiftScalarProp: shiftScalarProp
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = ns;
    } else {
        global.SplitByDistanceCore = ns;
    }

})(this);
