// MarkerCopy.core.js
// MarkerCopy のロジック本体（UI非依存）。
//
// ExtendScript側（MarkerCopy.jsx）からは #include で読み込み、
// テスト側（__tests__/MarkerCopy.core.test.js）からは Node の require() で読み込む。
// そのため UI の状態（ScriptUIのチェックボックス等）には一切依存せず、
// 必要な値はすべて引数で受け取る。

(function (global) {

    function markerValueToObj(mv) {
        return {
            comment:      mv.comment,
            duration:     mv.duration,
            chapter:      mv.chapter,
            url:          mv.url,
            frameTarget:  mv.frameTarget,
            cuePointName: mv.cuePointName,
            label:        mv.label
        };
    }

    function buildMarkerValue(obj) {
        var mv = new MarkerValue(obj.comment);
        mv.duration     = obj.duration;
        mv.chapter      = obj.chapter;
        mv.url          = obj.url;
        mv.frameTarget  = obj.frameTarget;
        mv.cuePointName = obj.cuePointName;
        mv.label        = obj.label;
        return mv;
    }

    function collectFromProp(prop) {
        var list = [];
        for (var k = 1; k <= prop.numKeys; k++) {
            list.push({ time: prop.keyTime(k), obj: markerValueToObj(prop.keyValue(k)) });
        }
        return list;
    }

    // マーカー群の最小時刻を返す
    function firstTime(markers) {
        if (markers.length === 0) return 0;
        var t = markers[0].time;
        for (var i = 1; i < markers.length; i++) {
            if (markers[i].time < t) t = markers[i].time;
        }
        return t;
    }

    // srcMarkers: [{time, obj}]
    // options: { usePosition: boolean, keepExisting: boolean }
    function pasteToMarkerProp(destProp, destCti, layerOffset, srcMarkers, options) {
        var usePosition  = options.usePosition;
        var keepExisting = options.keepExisting;

        // 「現在位置にペースト」：先頭マーカーをCTIに合わせてシフト
        var shift = usePosition ? (destCti - firstTime(srcMarkers)) : 0;

        var toWrite = [];
        for (var i = 0; i < srcMarkers.length; i++) {
            var t = srcMarkers[i].time + shift - layerOffset;
            toWrite.push({ time: t, obj: srcMarkers[i].obj });
        }

        if (!keepExisting) {
            while (destProp.numKeys > 0) destProp.removeKey(1);
        }

        for (var j = 0; j < toWrite.length; j++) {
            destProp.setValueAtTime(toWrite[j].time, buildMarkerValue(toWrite[j].obj));
        }
        return toWrite.length;
    }

    var ns = {
        markerValueToObj:  markerValueToObj,
        buildMarkerValue:  buildMarkerValue,
        collectFromProp:   collectFromProp,
        firstTime:         firstTime,
        pasteToMarkerProp: pasteToMarkerProp
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = ns;
    } else {
        global.MarkerCopyCore = ns;
    }

})(this);
