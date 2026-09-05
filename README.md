# AE Scripts

A collection of free After Effects scripts for motion design and live concert visuals.

## Requirements

- Adobe After Effects 2026 (v26)
- Windows 11

> Tested on my own environment only. Compatibility with other versions or systems is not guaranteed.

## Scripts

| Script | Description |
|---|---|
| [Renamer](./Renamer/) | Batch rename selected layers or Project panel items: strip/prepend/append text and find & replace |
| [CompSettingsChanger](./CompSettingsChanger/) | Batch-edit selected comps' width/height (with aspect-ratio lock), framerate (with Drop/Non-Drop Frame presets), and duration |
| [MarkerCopy](./MarkerCopy/) | Copy & paste markers between layers and compositions |
| [SplitByDistance](./SplitByDistance/) | Group scattered layers by proximity and split each cluster into its own composition |
| [ExpressionToMatchName](./ExpressionToMatchName/) | Convert expressions that reference effects/parameters by display name into language-independent matchName references (plus a revert tool) |
| [RandomizeLayerStart](./RandomizeLayerStart/) | Randomize the start time of selected layers within the comp |
| [AutoCropComposition](./AutoCropComposition/) | Detect the used area of a composition and crop it, shifting layers to match |
| [CropLayersToCompSize](./CropLayersToCompSize/) | Wrap each layer into its own precomp sized to the composition |
| [LoopComp](./LoopComp/) | Create a new composition that loops a portion of the original via Time Remap |
| [LoopPrecomp](./LoopPrecomp/) | Precompose a comp for looping by splitting it at a given frame count |
| [GridChartMaker](./GridChartMaker/) | Generate a grid color chart sized to the active composition |
| [CueCutter](./CueCutter/) | Split precomposed layers into per-marker compositions using a "♪" layer's commented markers |
| [InsertRenderToSameNameComp](./InsertRenderToSameNameComp/) | Insert rendered footage into same-named comps (ignoring extension) and solo the inserted layer |
| [BPMMaker](./BPMMaker/) | Place beat markers or null keyframes at a given BPM |
| [FileViewer](./FileViewer/) | View text extracted from Word/PDF/Excel files inside After Effects |
| [AudioStereoFadeComp](./AudioStereoFadeComp/) | Create a comp from selected audio, apply the Stereo Mixer effect, and fade Left Level / Right Pan from 100% to 0% |

## Illustrator Scripts

After Effects向けが中心のリポジトリだが、Illustrator用の小さなユーティリティ
スクリプトもここに置いている。

| Script | Description |
|---|---|
| [GroupsToLayers](./Illustrator/GroupsToLayers/) | Split each group inside a layer out into its own layer |

## Expressions（エクスプレッション置き場）

完成した「スクリプト」ではなく、レイヤーのプロパティに直接貼り付けて使う
**エクスプレッションのコード片**は、別リポジトリ
[ae-expressions](https://github.com/SY-c7c3e1/ae-expressions) にまとめてある。

## Installation

1. Download the `.jsx` file from each script folder
2. Place it in your After Effects Scripts folder:
   ```
   C:\Program Files\Adobe\Adobe After Effects <version>\Support Files\Scripts\
   ```
3. In After Effects: **File → Scripts → Run Script File…**

> To dock as a panel, place the file in the `Scripts\ScriptUI Panels\` folder and restart After Effects.

## Launcher（ランチャーパネル）

毎回 File > Scripts > Run Script File… でフォルダを辿るのが面倒な場合は、
[`Launcher/AEScriptsLauncher.jsx`](./Launcher/) をパネルとして登録すると、
カテゴリのドロップダウンで選んだスクリプトをワンクリック実行できる。

1. **このリポジトリ全体**を好きな場所（例：`Documents\ae-scripts\`）に置く
2. `Launcher/AEScriptsLauncher.jsx` **だけ**を
   `Support Files\Scripts\ScriptUI Panels\` にコピーし、AEを再起動
   （リポジトリ本体は他の場所に置いたままでよい。移動不要）
3. AEのメニュー **Window → AEScriptsLauncher.jsx** でパネルを開く（ドッキング可）
4. 初回だけ「フォルダを追加…」で手順1のリポジトリのルートフォルダを指定
5. カテゴリのドロップダウンでカテゴリを選ぶと、その中のスクリプトのボタンが並ぶ。
   押すと対応するスクリプトが直接実行される

新しいスクリプトフォルダを追加したら「再スキャン」でボタンが増える。
カテゴリ名やボタンのラベルは [`Launcher/categories.json`](./Launcher/categories.json)
で調整できる（編集しなくてもフォルダ名がそのままカテゴリ名になる）。

### 非公開フォルダの追加（他の人が作ったスクリプトなど）

このリポジトリは公開（Public）なので、他人が作ったスクリプトはここには
含めない。その代わり、Launcherパネルの「フォルダを追加…」を使えば、
git管理外の別フォルダ（非公開の個人用フォルダなど）もスキャン対象として
追加登録できる。登録したフォルダの中のスクリプトも、同じパネルの中に
カテゴリ分けされて表示される（このリポジトリにコミットされることはない）。

## Testing

ロジックはAEを起動せずにNode.jsでテストできる（詳細は [`testing/README.md`](./testing/README.md)）。

```bash
npm test
```

新しいスクリプトを追加する際は、UI(`.jsx`)とロジック(`.core.js`)を分離しておくと
`__tests__/` にテストを追加しやすい。`MarkerCopy/` が実例。

## License

Free to use for personal and commercial projects.
Please do not redistribute or resell.

## Bug Reports & Requests

If you find a bug or have a feature request, please open an [Issue](../../issues).
Any feedback is welcome!

## Disclaimer

These scripts are provided as-is, without any warranty.
Use at your own risk.
