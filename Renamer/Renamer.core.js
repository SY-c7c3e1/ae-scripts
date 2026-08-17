// Renamer.core.js
// Renamer のロジック本体（UI非依存）。
//
// レイヤー名・Projectパネルのアイテム名のどちらにも使える汎用の
// 文字列変換ロジック（対象がどちらであっても "name" という文字列プロパティを
// 書き換えるだけなので、ロジックは共通化できる）。
//
// ExtendScript側（Renamer.jsx）からは #include で読み込み、
// テスト側（__tests__/Renamer.core.test.js）からは Node の require() で読み込む。
// そのため UI の状態（ScriptUIのテキスト欄等）には一切依存せず、
// 必要な値はすべて引数で受け取る。
//
// 処理順（元のスクリプトの挙動を踏襲）：
//   1. 先頭から指定文字数を削除
//   2. 末尾から指定文字数を削除
//   3. 文字列置換（前方一致ではなく全体を対象に、正規表現の特殊文字は自動エスケープ）
//   4. 先頭・末尾に文字列を追加

(function (global) {

    function escapeRegExp(text) {
        return text.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    }

    // name: 元の名前（レイヤー名 or Projectアイテム名）
    // options: {
    //   beforeReplaceText, afterReplaceText,  // 置換前後の文字列
    //   firstText, endText,                    // 先頭・末尾に追加する文字列
    //   firstDelNum, endDelNum                  // 先頭・末尾から削除する文字数
    // }
    function computeNewName(name, options) {
        options = options || {};

        var beforeReplaceText = options.beforeReplaceText || "";
        var afterReplaceText  = options.afterReplaceText  || "";
        var firstText         = options.firstText         || "";
        var endText            = options.endText           || "";
        var firstDelNum         = options.firstDelNum       || 0;
        var endDelNum            = options.endDelNum         || 0;

        var result = name;

        // 最初から削除（範囲チェック：名前の全長以上は削除しない）
        if (firstDelNum > 0 && firstDelNum < result.length) {
            result = result.slice(firstDelNum);
        }

        // 最後から削除（範囲チェック）
        if (endDelNum > 0 && endDelNum < result.length) {
            result = result.slice(0, -endDelNum);
        }

        // 置換（正規表現で全置換）
        if (beforeReplaceText !== "") {
            try {
                var regex = new RegExp(escapeRegExp(beforeReplaceText), 'g');
                // 置換後テキストを関数で渡すことで、"$&" や "$1" のような
                // String#replace の特殊パターンとして解釈されるのを防ぎ、
                // 常にそのままの文字列として挿入する。
                result = result.replace(regex, function () { return afterReplaceText; });
            } catch (e) {
                // エラー時は無視（置換前の文字列のまま次の処理へ）
            }
        }

        // 最初と最後に文字追加
        result = firstText + result + endText;

        return result;
    }

    var ns = {
        escapeRegExp:  escapeRegExp,
        computeNewName: computeNewName
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = ns;      // Node（テストから require）
    } else {
        global.RenamerCore = ns;  // ExtendScript（#include後、グローバルに生える）
    }

})(this);
