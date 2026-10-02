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

    // セクション（A/B/C…）に「何番か」を自動で付けた名前を返す。
    // idx番目のマーカーより前にある名前から、最後の「番号+文字」（例 "2B"）を探し、
    //   押した文字がそれより後ろ（B→C） → 同じ番号（"2C"）
    //   同じか前（C→A, C→C）           → 次の番号（"3A", "3C"）
    //   前に無い                         → 1（"1A"）
    // opts.roundLetters に含まれない文字（D, E など）は番号なしでそのまま返す。
    function resolveSection(mk, idx, letter, opts) {
        var round = opts.roundLetters || [];
        var inRound = false;
        for (var r = 0; r < round.length; r++) {
            if (round[r] === letter) { inRound = true; break; }
        }
        if (!inRound) return letter;

        var re = /^(\d+)([A-Za-z])$/;
        for (var i = Math.min(idx, mk.numKeys + 1) - 1; i >= 1; i--) {
            var m = re.exec(stripNumber(mk.keyValue(i).comment));
            if (!m) continue;
            var prevLetter = m[2].toUpperCase();
            var isRound = false;
            for (var k = 0; k < round.length; k++) {
                if (round[k] === prevLetter) { isRound = true; break; }
            }
            if (!isRound) continue;
            var n = parseInt(m[1], 10);
            return (letter > prevLetter ? n : n + 1) + letter;
        }
        return "1" + letter;
    }

    var ns = {
        resolveSection: resolveSection,
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
