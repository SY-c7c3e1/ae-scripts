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
    // マスクの頂点からバウンディングボックスを求める
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

    // 新規コンプのサイズ（1..maxSizeにクランプ）とオフセットを計算
    function computeCompLayout(box, margin, maxSize) {
        var width  = Math.min(maxSize, Math.max(1, Math.ceil((box.right - box.left) + margin * 2)));
        var height = Math.min(maxSize, Math.max(1, Math.ceil((box.bottom - box.top) + margin * 2)));
        return {
            width: width,
            height: height,
            offsetX: box.left - margin,
            offsetY: box.top - margin
        };
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
        computeCompLayout: computeCompLayout,
        shiftVectorProp: shiftVectorProp,
        shiftScalarProp: shiftScalarProp
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = ns;
    } else {
        global.SplitByDistanceCore = ns;
    }

})(this);
