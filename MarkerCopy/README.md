# MarkerCopy.jsx

A clipboard-style marker copy & paste tool for After Effects.
Copy markers from layers or compositions and paste them anywhere — even across different compositions.

---

## Installation

Place `MarkerCopy.jsx` in your After Effects Scripts folder and restart After Effects.

```
C:\Program Files\Adobe\Adobe After Effects <version>\Support Files\Scripts\
```

Run it from **File → Scripts → Run Script File…**

> To dock as a panel, place the file in `Scripts\ScriptUI Panels\` instead.

---

## How to Use

Just two steps: **Copy → Paste**

### Step 1 — Copy

| Source | How |
|---|---|
| Layer markers | Select the layer(s) and click **[Copy]** |
| Comp markers | Deselect all layers and click **[Copy]** |
| Multiple layers | Select multiple layers and click **[Copy]** (markers are merged) |

Once copied, the clipboard panel shows the source name and marker count.
The clipboard is retained until the panel is closed.

### Step 2 — Paste

| Destination | How |
|---|---|
| Layer markers | Select the target layer(s) and click **[Paste]** |
| Comp markers | Deselect all layers and click **[Paste]** |
| Multiple layers at once | Select multiple layers and click **[Paste]** |

Switch to a different composition and paste to copy markers across comps.

---

## Options

### Paste at Current Position
Shifts all markers so the **first marker lands on the playhead**.

- **OFF (default)** — Paste at the original absolute time
- **ON** — Paste relative to the current playhead position

Useful when reusing the same marker pattern at a different point in the timeline.

### Keep Existing Markers
- **OFF (default)** — Clears existing markers before pasting (overwrite)
- **ON** — Adds markers on top of existing ones (append)

### Use Layer In-Point as Offset
- **OFF (default)** — Uses absolute composition time
- **ON** — Uses time relative to the layer's in-point. Handy for looping layers where you want the layer start treated as time 0.

---

## Examples

### Layer markers → Comp markers
1. Select the layer with markers → **[Copy]**
2. Deselect all layers → **[Paste]**

### Comp markers → Another comp
1. In the source comp (no layer selected) → **[Copy]**
2. Switch to the destination comp
3. (No layer selected) → **[Paste]**

### Duplicate layer markers within the same comp
1. Select the source layer → **[Copy]**
2. Select the target layer → **[Paste]**

### Paste from playhead position
1. Copy markers
2. Move the playhead to where you want the first marker
3. Check **"Paste at Current Position"** → **[Paste]**

---

## Notes

- Copied marker data includes: comment, duration, chapter, URL, frame target, cue point name, label
- The clipboard resets when the panel is closed
- Supports Undo (Ctrl+Z)

---

---

# MarkerCopy.jsx（日本語）

After Effects のマーカーをクリップボード方式でコピー＆ペーストするスクリプト。
レイヤーマーカー・コンポマーカーをまたいで、または別コンポ間でも自由にコピーできます。

---

## インストール

`MarkerCopy.jsx` を以下のフォルダに置いて、After Effects を再起動してください。

```
C:\Program Files\Adobe\Adobe After Effects <バージョン>\Support Files\Scripts\
```

**ファイル → スクリプト → スクリプトを実行…** から起動します。

> `Scripts\ScriptUI Panels\` に置けばパネルとして常駐できます。

---

## 基本の使い方

**Copy → Paste** の2ステップだけです。

### Step 1 — Copy

| コピー元 | 操作 |
|---|---|
| レイヤーマーカー | レイヤーを選択して **[Copy]** |
| コンポマーカー | レイヤーを選択せずに **[Copy]** |
| 複数レイヤー | 複数選択して **[Copy]**（マーカーは統合されます） |

コピーするとパネルにコピー元の名前とマーカー数が表示されます。クリップボードはパネルを閉じるまで保持されます。

### Step 2 — Paste

| ペースト先 | 操作 |
|---|---|
| レイヤーマーカー | レイヤーを選択して **[Paste]** |
| コンポマーカー | レイヤーを選択せずに **[Paste]** |
| 複数レイヤーに一括 | 複数選択して **[Paste]** |

別のコンポに移動してからペーストすれば、コンポをまたいだコピーも可能です。

---

## オプション

### 現在位置にペースト
先頭マーカーが再生ヘッドの位置に来るよう全体をシフトしてペーストします。

- **OFF（デフォルト）** — 元の絶対時刻のままペースト
- **ON** — 再生ヘッドを起点にペースト

### 既存マーカーを保持（追記）
- **OFF（デフォルト）** — 既存マーカーを削除してから貼る（上書き）
- **ON** — 既存マーカーはそのままで追記する

### レイヤーのイン点をオフセットに使う
- **OFF（デフォルト）** — コンポの絶対時刻でコピー／ペースト
- **ON** — レイヤーのイン点を基準にした相対時刻でコピー／ペースト

---

## 使用例

### レイヤーマーカー → コンポマーカー
1. マーカーが付いているレイヤーを選択 → **[Copy]**
2. レイヤーの選択を解除 → **[Paste]**

### コンポマーカー → 別コンポのコンポマーカー
1. コピー元コンポで（レイヤー未選択）→ **[Copy]**
2. コピー先コンポをアクティブにする
3. （レイヤー未選択）→ **[Paste]**

### 再生ヘッドの位置からペースト
1. マーカーをコピー
2. ペースト先で再生ヘッドを置きたい位置に移動
3. **「現在位置にペースト」にチェック** → **[Paste]**

---

## 注意事項

- コピーされるマーカー情報：コメント、デュレーション、チャプター、URL、フレームターゲット、キューポイント名、ラベル
- クリップボードはパネルを閉じるとリセットされます
- Undo（Ctrl+Z）に対応しています
