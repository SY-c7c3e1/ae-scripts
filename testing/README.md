# テストの仕組み（Testing Harness）

このリポジトリのスクリプト・プラグイン・拡張機能を、**After Effectsを起動せずに**
オフラインでロジック検証するための仕組み。Node.js の標準テストランナー
（`node --test`）だけで動く。npm依存パッケージはゼロ。

AE内での最終的な動作確認（UIの見た目、実プロジェクトでの挙動）は、これまで通り
開発者自身がAE上で行う。ここで自動化するのは、その手前のロジックレベルの検証。

## 実行方法

```bash
npm test
```

内部的には `node --test` を実行しているだけ。`__tests__/` 配下や
`*.test.js` にマッチするファイルを自動で探して実行する。

## 規約：ロジックとUIを分離する

ExtendScript(.jsx)はAEのアプリケーションオブジェクト（`app`, `MarkerValue`,
ScriptUIの`Window`等）に依存するため、そのままではAE外で実行できない。
そこで各ツールは次の2ファイルに分ける。

```
<ToolName>/
  <ToolName>.jsx        # UI（ScriptUI）とAEオブジェクトへの実際のアクセスのみ
  <ToolName>.core.js     # 純粋なロジック本体（UI非依存・AEの生オブジェクトは引数で受け取る）
  __tests__/
    <ToolName>.core.test.js
```

`*.core.js` は ExtendScript と Node.js の両方から読み込めるよう、
以下の形（UMD風の最小パターン）で書く。

```js
(function (global) {
    function doSomething(x) { /* ... */ }

    var ns = { doSomething: doSomething };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = ns;          // Node（テストから require）
    } else {
        global.MyToolCore = ns;       // ExtendScript（#include後、グローバルに生える）
    }
})(this);
```

`.jsx` 側からは、ファイル先頭で `#include` して名前空間経由で呼び出す。

```js
#include "MyTool.core.js"

(function () {
    // ...
    MyToolCore.doSomething(x);
})();
```

このパターンの実例は [`MarkerCopy/MarkerCopy.core.js`](../MarkerCopy/MarkerCopy.core.js)
と [`MarkerCopy/MarkerCopy.jsx`](../MarkerCopy/MarkerCopy.jsx) を参照。

## `ae-mock.js`：AE APIの軽量モック

[`ae-mock.js`](./ae-mock.js) には、AEの `MarkerValue` やプロパティオブジェクト
（`numKeys` / `keyTime()` / `keyValue()` / `setValueAtTime()` など）を模した
最小限のモックを置く。フルモックは目指さない。**新しいテストを書く際に
必要になったAPIだけをここに追加していく。**

テストからは以下のように使う。

```js
const { MockMarkerValue, createMockMarkerProperty } = require("../../testing/ae-mock.js");

global.MarkerValue = MockMarkerValue; // core.js が `new MarkerValue()` するため
const MyToolCore = require("../MyTool.core.js");
```

## この仕組みでカバーしないもの

- AE上でのUI操作・実プロジェクトでの結合動作（開発者が手動でAE上で確認する）
- ネイティブプラグイン（AEGP / C++）— JSベースのこの仕組みでは検証できない。
  別途 GoogleTest 等の仕組みが必要になったら別ディレクトリで検討する。

## 将来のCEP/UXP拡張機能への展望

CEP（HTML/JSパネル）やUXP拡張を追加する場合も、AEとやり取りする実処理は
最終的に ExtendScript（`evalScript`経由）または UXPのAPI呼び出しになる。
そのロジックも同じ `*.core.js` 分離パターンで書けば、この仕組みでそのまま
テストできる想定。ディレクトリ構成の目安：

```
extensions/<ExtensionName>/
  client/            # CEPパネルのHTML/JS、またはUXPのUI
  host/
    <Name>.jsx         # ExtendScriptホスト側（AE操作）
    <Name>.core.js       # ロジック本体（ここが今回の仕組みでテスト対象になる）
  __tests__/
    <Name>.core.test.js
```
