// MarkerNamer.core.js
// MarkerNamer のロジック本体（UI非依存）。
//
// ExtendScript側（C7_MarkerNamer.jsx）からは #include で読み込み、
// テスト側（__tests__/MarkerNamer.core.test.js）からは Node の require() で読み込む。
// マーカープロパティ（layer.property("ADBE Marker")）と設定値は引数で受け取る。

(function (global) {

    // "01_1A" → "1A"（先頭の連番を外す）
    function stripNumber(s) {
        return String(s).replace(/^\d+_/, "");
    }

    // 番号を付けない名前か（大文字小文字は区別しない）
    function isNoNumber(name, noNumberList) {
        var n = String(name).toLowerCase();
        for (var i = 0; i < noNumberList.length; i++) {
            if (String(noNumberList[i]).toLowerCase() === n) return true;
        }
        return false;
    }

    function pad(num, digits) {
        var s = String(num);
        while (s.length < digits) s = "0" + s;
        return s;
    }

    // CTI位置、またはその直前にあるマーカーの番号（1始まり）。
    // CTIが先頭マーカーより前なら 1。マーカーが無ければ 0。
    // 半フレーム分の誤差は同じ位置とみなす。
    function currentIndex(mk, time, frameDuration) {
        if (mk.numKeys === 0) return 0;
        var t = time + frameDuration * 0.5;
        var idx = 0;
        for (var i = 1; i <= mk.numKeys; i++) {
            if (mk.keyTime(i) <= t) idx = i; else break;
        }
        return idx === 0 ? 1 : idx;
    }

    // 時間順に連番を振り直す。空欄と番号なしの名前は数えない。
    // opts: { noNumber: [..], digits: 2 }
    function renumber(mk, opts) {
        var count = 0;
        for (var i = 1; i <= mk.numKeys; i++) {
            var mv = mk.keyValue(i);
            var base = stripNumber(mv.comment);
            var newName;
            if (base === "")                          newName = "";
            else if (isNoNumber(base, opts.noNumber)) newName = base;
            else { count++; newName = pad(count, opts.digits) + "_" + base; }
            if (newName !== mv.comment) {
                mv.comment = newName;          // 色・長さなど他の値はそのまま残す
                mk.setValueAtKey(i, mv);
            }
        }
    }

    // idx番目のマーカーに名前を付け（""で消去）、全体の連番を振り直す
    function setName(mk, idx, name, opts) {
        if (idx < 1 || idx > mk.numKeys) return;
        var mv = mk.keyValue(idx);
        mv.comment = name;
        mk.setValueAtKey(idx, mv);
        renumber(mk, opts);
    }

    var ns = {
        stripNumber:  stripNumber,
        isNoNumber:   isNoNumber,
        pad:          pad,
        currentIndex: currentIndex,
        renumber:     renumber,
        setName:      setName
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = ns;
    } else {
        global.MarkerNamerCore = ns;
    }

})(this);
