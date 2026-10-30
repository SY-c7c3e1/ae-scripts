// ExportMarkerFrames.core.js
// ExportMarkerFrames.jsx のロジック本体（UI・AE非依存）。Nodeでテストできる。
//
// CSV の列（1行目が見出し）：
//   Name           M001, M002 … 通し番号（UE5 の Data Table で行名として使われる）
//   Frame          マーカーの位置（AEのタイムラインに表示されている番号）
//   EndFrame       マーカーの終わり（長さのないマーカーは Frame と同じ）
//   DurationFrames マーカーの長さ（フレーム数）
//   Seconds        コンポの頭からの秒数
//   Timecode       HH:MM:SS:FF（ノンドロップ）
//   FPS            コンポのフレームレート
//   Source         どのマーカーか（"Comp" またはレイヤー名）
//   Comment        マーカーのコメント

(function (global) {

    var HEADER = ["Name", "Frame", "EndFrame", "DurationFrames", "Seconds", "Timecode", "FPS", "Source", "Comment"];

    function pad(n, len) {
        var s = String(n);
        while (s.length < len) s = "0" + s;
        return s;
    }

    // ノンドロップのタイムコード。29.97 などは 30 として数える（表記用）
    function timecode(frame, fps) {
        var base = Math.round(fps);
        var neg = frame < 0;
        var f = Math.abs(frame);
        var ff = f % base;
        var totalSec = Math.floor(f / base);
        var ss = totalSec % 60;
        var mm = Math.floor(totalSec / 60) % 60;
        var hh = Math.floor(totalSec / 3600);
        return (neg ? "-" : "") + pad(hh, 2) + ":" + pad(mm, 2) + ":" + pad(ss, 2) + ":" + pad(ff, 2);
    }

    // 秒 → フレーム（浮動小数の誤差を吸収）
    function toFrame(seconds, fps) {
        return Math.round(seconds * fps + 1e-6);
    }

    function trimText(s) {
        return String(s === undefined || s === null ? "" : s).replace(/^[\s　]+|[\s　]+$/g, "");
    }

    // markers: [{ time: 秒（コンポの頭から）, duration: 秒, comment: 文字列, source: "Comp" or レイヤー名 }]
    // options: { fps, startFrame（表示上の開始フレーム。通常0）, commentOnly: bool }
    // 戻り値: 行オブジェクトの配列（フレーム順）
    function buildRows(markers, options) {
        var fps = options.fps;
        var start = options.startFrame || 0;
        var list = [];
        for (var i = 0; i < markers.length; i++) {
            var m = markers[i];
            var comment = trimText(m.comment);
            if (options.commentOnly && comment === "") continue;
            var frame = toFrame(m.time, fps) + start;
            var dur = toFrame(m.duration || 0, fps);
            list.push({
                frame: frame,
                endFrame: frame + dur,
                durationFrames: dur,
                seconds: Math.round(m.time * 1000) / 1000,
                timecode: timecode(frame, fps),
                fps: fps,
                source: m.source || "",
                comment: comment,
                order: i
            });
        }
        list.sort(function (a, b) {
            if (a.frame !== b.frame) return a.frame - b.frame;
            return a.order - b.order;
        });
        for (var j = 0; j < list.length; j++) {
            list[j].name = "M" + pad(j + 1, 3);
            delete list[j].order;
        }
        return list;
    }

    // CSVの1マス分。カンマ・ダブルクォート・改行を含むときは "" で囲む
    function csvCell(v) {
        var s = String(v);
        if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
        return s;
    }

    function toCsv(rows) {
        var lines = [HEADER.join(",")];
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            lines.push([
                r.name, r.frame, r.endFrame, r.durationFrames, r.seconds,
                r.timecode, r.fps, csvCell(r.source), csvCell(r.comment)
            ].join(","));
        }
        return lines.join("\r\n") + "\r\n";
    }

    // "My Comp" → "My Comp_markers.csv"（ファイル名に使えない文字は _ に）
    function defaultFileName(compName) {
        return String(compName || "markers").replace(/[\\\/:\*\?"<>\|]/g, "_") + "_markers.csv";
    }

    var ns = {
        HEADER: HEADER,
        timecode: timecode,
        buildRows: buildRows,
        csvCell: csvCell,
        toCsv: toCsv,
        defaultFileName: defaultFileName
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = ns;
    } else {
        global.ExportMarkerFramesCore = ns;
    }

})(this);
