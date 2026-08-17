// CompSettingsChanger.core.js
// CompSettingsChanger のロジック本体（UI非依存）。
//
// ExtendScript側（C7_CompSettingsChanger.jsx）からは #include で読み込み、
// テスト側（__tests__/CompSettingsChanger.core.test.js）からは Node の require() で読み込む。
// そのため UI の状態（ScriptUIのテキスト欄等）やAEの実オブジェクト（CompItem等）には
// 一切依存せず、必要な値はすべて引数で受け取る。

(function (global) {

    function trim(s) {
        return String(s).replace(/^\s+|\s+$/g, "");
    }

    // "16:9" / "16/9" / "16x9" / "1.778" のいずれの書式も受け付ける。
    // 空文字はnull、不正な値はNaNを返す。
    function parseRatio(text) {
        text = trim(text || "");
        if (text === "") return null;

        var m = text.match(/^(\d+(\.\d+)?)\s*[:\/xX]\s*(\d+(\.\d+)?)$/);
        if (m) {
            var w = parseFloat(m[1]);
            var h = parseFloat(m[3]);
            if (h === 0) return NaN;
            return w / h;
        }
        return parseFloat(text);
    }

    // フレームレートのプリセット一覧。
    // key: UIのdropdownlistと紐付けるための識別子
    // label: ドロップダウンに表示するテキスト（このままUI側で使う）
    // frameRate / dropFrame: 選択時に適用する値（"none"と"custom"にはframeRateを持たせない）
    var FRAME_RATE_PRESETS = [
        { key: "none",    label: "変更しない" },
        { key: "2997ndf", label: "29.97 (Non-Drop Frame)", frameRate: 29.97, dropFrame: false },
        { key: "2997df",  label: "29.97 (Drop Frame)",     frameRate: 29.97, dropFrame: true  },
        { key: "5994ndf", label: "59.94 (Non-Drop Frame)", frameRate: 59.94, dropFrame: false },
        { key: "5994df",  label: "59.94 (Drop Frame)",     frameRate: 59.94, dropFrame: true  },
        { key: "30",      label: "30",                     frameRate: 30,    dropFrame: false },
        { key: "60",      label: "60",                     frameRate: 60,    dropFrame: false },
        { key: "custom",  label: "カスタム…" }
    ];

    // key: FRAME_RATE_PRESETSのkey（ドロップダウンの選択）
    // customText: key==="custom"のときに使う手入力のテキスト
    // 戻り値: { frameRate: number|null, dropFrame: boolean|null, error: string|null }
    //   frameRateがnullなら「変更しない」
    function resolveFrameRateSelection(key, customText) {
        var result = { frameRate: null, dropFrame: null, error: null };

        if (!key || key === "none") return result;

        if (key === "custom") {
            var v = parseFloat(customText);
            if (isNaN(v)) {
                result.error = "フレームレートが数値ではありません";
                return result;
            }
            if (v < 1 || v > 99) {
                result.error = "フレームレートが範囲外です（1〜99）";
                return result;
            }
            result.frameRate = v;
            result.dropFrame = false;
            return result;
        }

        for (var i = 0; i < FRAME_RATE_PRESETS.length; i++) {
            if (FRAME_RATE_PRESETS[i].key === key) {
                result.frameRate = FRAME_RATE_PRESETS[i].frameRate;
                result.dropFrame = FRAME_RATE_PRESETS[i].dropFrame;
                return result;
            }
        }

        result.error = "不明なフレームレート指定です";
        return result;
    }

    // current: { width, height } 変更前のコンポサイズ
    // input:   { widthText, heightText, ratioText }
    //
    // 優先順位：
    //   1. Width・Height両方指定 → そのまま使う（比率は無視）
    //   2. Width＋比率 → 比率から高さを算出
    //   3. Height＋比率 → 比率から幅を算出
    //   4. 比率のみ → 現在の幅を基準に高さを算出
    //   5. Widthのみ → 高さは変更しない
    //   6. Heightのみ → 幅は変更しない
    //   7. 何も指定なし → 変更しない
    function computeDimensions(current, input) {
        input = input || {};
        var widthText  = trim(input.widthText  || "");
        var heightText = trim(input.heightText || "");
        var ratioText  = trim(input.ratioText  || "");

        var result = { width: current.width, height: current.height, error: null };

        var width  = null;
        var height = null;

        if (widthText !== "") {
            width = parseFloat(widthText);
            if (isNaN(width)) { result.error = "Widthが数値ではありません"; return result; }
        }
        if (heightText !== "") {
            height = parseFloat(heightText);
            if (isNaN(height)) { result.error = "Heightが数値ではありません"; return result; }
        }

        var ratio = null;
        if (ratioText !== "") {
            ratio = parseRatio(ratioText);
            if (ratio === null || isNaN(ratio) || ratio <= 0) {
                result.error = "アスペクト比の指定が不正です（例: 16:9 または 1.778）";
                return result;
            }
        }

        if (width !== null && height !== null) {
            // 両方指定：そのまま使う
        } else if (width !== null && ratio !== null) {
            height = width / ratio;
        } else if (height !== null && ratio !== null) {
            width = height * ratio;
        } else if (ratio !== null) {
            width  = current.width;
            height = current.width / ratio;
        } else if (width !== null) {
            height = current.height;
        } else if (height !== null) {
            width = current.width;
        } else {
            return result; // 何も指定なし：変更しない
        }

        width  = Math.floor(width);
        height = Math.floor(height);

        if (width < 4 || width > 30000) {
            result.error = "Widthが範囲外です（4〜30000）";
            return result;
        }
        if (height < 4 || height > 30000) {
            result.error = "Heightが範囲外です（4〜30000）";
            return result;
        }

        result.width  = width;
        result.height = height;
        return result;
    }

    // durationFramesText: Duration欄のテキスト（フレーム数）
    // effectiveFrameRate: そのコンポに適用されるフレームレート（今回変更する場合は新しい値、しないなら現在値）
    // 戻り値: { durationSeconds: number|null, error: string|null }
    //   durationSecondsがnullなら「変更しない」
    function computeDurationSeconds(durationFramesText, effectiveFrameRate) {
        var result = { durationSeconds: null, error: null };

        var text = trim(durationFramesText || "");
        if (text === "") return result;

        var frames = parseFloat(text);
        if (isNaN(frames)) {
            result.error = "Durationが数値ではありません";
            return result;
        }

        var seconds = frames / effectiveFrameRate;
        if (seconds <= 0 || seconds > 323676) {
            result.error = "Durationが範囲外です";
            return result;
        }

        result.durationSeconds = seconds;
        return result;
    }

    // 新しいDurationが今までより長くなるかどうか（＝レイヤー伸長が必要か）を判定。
    // どちらも秒単位で比較する（フレーム数と秒を直接比較していた旧スクリプトの不具合を修正）。
    function shouldExtendLayers(newDurationSeconds, oldDurationSeconds) {
        return newDurationSeconds > oldDurationSeconds;
    }

    // 再センタリング用のnullレイヤーの移動量（秒ではなくpx、position用）
    function computeRecenterOffset(oldSize, newSize) {
        return (newSize - oldSize) * 0.5;
    }

    // layers: { outPoint, locked } を持つオブジェクトの配列（実際のAE Layerオブジェクトでもよい）
    // compEnd: 変更前のコンポ終端（秒）
    // newEnd:  新しいコンポ終端（秒）
    // comp終端まで達しているレイヤーのアウト点だけを新しい終端に合わせて伸ばす。
    // ロックされていたレイヤーは一時的にアンロックしてから戻す。
    function extendLayersToNewEnd(layers, compEnd, newEnd) {
        var extendedCount = 0;
        for (var i = 0; i < layers.length; i++) {
            var layer = layers[i];
            if (layer && layer.outPoint >= compEnd) {
                var wasLocked = !!layer.locked;
                if (wasLocked) layer.locked = false;
                layer.outPoint = newEnd;
                if (wasLocked) layer.locked = true;
                extendedCount++;
            }
        }
        return extendedCount;
    }

    var ns = {
        FRAME_RATE_PRESETS:        FRAME_RATE_PRESETS,
        parseRatio:                parseRatio,
        resolveFrameRateSelection: resolveFrameRateSelection,
        computeDimensions:         computeDimensions,
        computeDurationSeconds:    computeDurationSeconds,
        shouldExtendLayers:        shouldExtendLayers,
        computeRecenterOffset:     computeRecenterOffset,
        extendLayersToNewEnd:      extendLayersToNewEnd
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = ns;               // Node（テストから require）
    } else {
        global.CompSettingsChangerCore = ns; // ExtendScript（#include後、グローバルに生える）
    }

})(this);
