# このリポジトリでの作業指針

After Effects用のスクリプト・パネル・（将来的な）拡張機能を集めたリポジトリ。
ユーザーはExtendScript/JS開発に必ずしも詳しくないので、専門用語を避けて
説明すること。

## 新しく作るツールスクリプトの命名規則

**Claudeが新規に作成するAEツールスクリプト（.jsx）のファイル名には `C7_` を
接頭辞として付ける**（例: `C7_XxxYyy.jsx`）。

- 既存の `ExpressionToMatchName/C7_*.jsx` は別作者（"c7"さん）によるもので、
  たまたま同じ接頭辞。ユーザーが確認の上「同じ表記でよい」と判断したため、
  今後Claudeが作るものも同じ `C7_` を使う。作者を厳密に区別する用途では
  ないので、そのつもりで。
- MarkerCopy / SplitByDistance / ExpressionToMatchName は元からリポジトリに
  あったスクリプトで、Claudeが作成したものではない（接頭辞なし）。
- 対象は「AE上で実行するツールスクリプト（.jsx）」。`*.core.js`（ロジック
  本体）や `testing/`, `Launcher/` 配下の基盤コードには付けない。

## コードの分離規約（テスト基盤）

AEを起動せずにロジックを検証できるよう、各ツールは UI(`.jsx`) とロジック
(`.core.js`) を分離する。詳細と実例は [`testing/README.md`](./testing/README.md)
を参照。新しいツールを作る際もこの構成に従うこと。

```
<ToolName>/
  <ToolName>.jsx        # UI（ScriptUI）とAEオブジェクトへの実際のアクセスのみ
  <ToolName>.core.js     # 純粋なロジック本体（UI非依存）
  __tests__/
    <ToolName>.core.test.js
```

`npm test`（`node --test`）で全テストを実行できる。

## Launcherパネル

[`Launcher/AEScriptsLauncher.jsx`](./Launcher/AEScriptsLauncher.jsx) は、AEに
ドッキングできるスクリプト起動パネル。ユーザーはこれをAEの
`ScriptUI Panels` フォルダに**単体でコピー**して使う（リポジトリ本体は
別の場所に置いたまま）。そのため:

- `Launcher.core.js` を `#include` で読み込んではいけない（相対パスが
  コピー先で解決できずエラーになる）。実行時に `$.evalFile` で読み込む
  設計になっている（`ensureCoreLoaded`関数）。同様の単体配布を前提にした
  ファイルを作る場合はこの点に注意する。
- Launcherは複数フォルダ（root）をスキャンできる。ae-scriptsリポジトリ本体
  （Public）に加えて、ユーザーが非公開で管理している個人用フォルダや、
  他人が作ったスクリプトを置いたフォルダも「追加」で登録できる設計。
- カテゴリ名・表示順・ラベルの上書きは `Launcher/categories.json`
  （フォルダ名がキー）。

## リポジトリの公開範囲について

- このリポジトリ（`ae-scripts`）自体は意図的に **Public**。
- **他人が作成したスクリプトはこのリポジトリに含めない。** ユーザーは
  それらを別の非公開フォルダで管理し、Launcherの「追加フォルダ」機能で
  同じパネルから使う運用にしている。リポジトリへのコミットを提案しない
  こと。
