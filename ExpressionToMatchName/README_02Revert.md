# c7 Revert to Original Expression

Restores the original, pre-conversion expression on properties that were
converted by [`C7_ExpressionToMatchName.jsx`](./C7_ExpressionToMatchName.jsx),
using the commented-out original text that conversion leaves in place.

```
// --- Original expression (auto-converted by c7) ---
// thisComp.layer("CONTROL").effect("Drop Shadow")("Opacity")
// --- UI-independent version below ---
thisComp.layer("CONTROL")("ADBE Effect Parade")(3)("ADBE Drop Shadow-0002")
```

Running the revert script on the property above restores it to:

```
thisComp.layer("CONTROL").effect("Drop Shadow")("Opacity")
```

## When to use this

- A conversion didn't behave as expected and you want to undo it without
  manually retyping the original expression.
- You want to re-run `C7_ExpressionToMatchName.jsx` on a property after
  fixing something (the converter only matches `effect(...)` calls, so it
  can't re-process a property that's already been converted — revert first,
  then convert again).

## Usage

1. In the timeline, select the property/properties you want to revert —
   click the "Expression: ..." row(s). Multiple selection is supported.
2. Run `C7_RevertToOriginalExpression.jsx`
   (`File > Scripts > Run Script File...`).
3. A summary alert reports how many were reverted vs. skipped.

Properties whose expression doesn't contain the conversion marker comments
are left completely untouched and counted as skipped — this script never
modifies anything it didn't itself convert.

## Notes

- Changes are wrapped in a single Undo group — `Ctrl+Z` / `Cmd+Z`
  immediately after running reverts everything (only before saving).
- This only works on properties converted by `C7_ExpressionToMatchName.jsx`
  from this same repo — it looks for that script's exact marker comments.

---

# c7 元のエクスプレッションに復元

[`C7_ExpressionToMatchName.jsx`](./C7_ExpressionToMatchName.jsx) で変換
したプロパティを、変換時にコメントとして残しておいた元の式を使って、
変換前の状態に復元します。

```
// --- Original expression (auto-converted by c7) ---
// thisComp.layer("CONTROL").effect("ドロップシャドウ")("不透明度")
// --- UI-independent version below ---
thisComp.layer("CONTROL")("ADBE Effect Parade")(3)("ADBE Drop Shadow-0002")
```

上記のプロパティに対してこの復元スクリプトを実行すると、次のように戻ります:

```
thisComp.layer("CONTROL").effect("ドロップシャドウ")("不透明度")
```

## こんなときに使う

- 変換結果が想定通りに動かず、元の式に手打ちで戻すのが面倒なとき。
- 何か直した上で `C7_ExpressionToMatchName.jsx` を再実行したいとき
  (変換スクリプトは `effect(...)` の形しか検知しないため、すでに変換済み
  のプロパティはそのままでは再変換できません。一度復元してから、
  もう一度変換してください)。

## 使い方

1. タイムラインで、復元したいプロパティ(「Expression: ○○」の行)を
   選択します。複数選択も可能です。
2. `C7_RevertToOriginalExpression.jsx` を実行します
   (`ファイル > スクリプト > スクリプトファイルを実行`)。
3. 完了アラートで、復元した件数・スキップした件数が確認できます。

変換マーカーのコメントが含まれていないプロパティは一切変更されず、
スキップとしてカウントされます。このスクリプト自身が変換したもの以外は
触りません。

## 補足

- 変更は1つのUndoグループにまとまっているので、実行直後なら `Ctrl+Z` /
  `Cmd+Z` で全体を取り消せます(保存前のみ)。
- このスクリプトは、同じリポジトリの `C7_ExpressionToMatchName.jsx` で
  変換したプロパティのみを対象とします(このスクリプト特有のマーカー
  コメントを探して判定しているため)。
