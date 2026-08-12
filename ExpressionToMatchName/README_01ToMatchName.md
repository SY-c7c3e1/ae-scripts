# c7 Expression → matchName Converter

Convert After Effects expressions that reference effects/parameters by their
**UI display name** (language-dependent) into references that use
**matchName** (language-independent) — so the same project's expressions
keep working whether opened in a Japanese, English, or any other AE UI
language.

```
Before: thisComp.layer("CONTROL").effect("Drop Shadow")("Opacity")
After : thisComp.layer("CONTROL")("ADBE Effect Parade")(3)("ADBE Drop Shadow-0002")
```

The original expression is always preserved as a comment directly above the
converted one, so nothing is lost.

## Why

An expression like `effect("ドロップシャドウ")("不透明度")`, written in a
Japanese-UI project, breaks with an expression error the moment the project
is opened in an English-UI copy of After Effects (or vice versa) — the
display names simply don't exist in the other language.

`matchName` is AE's internal, language-independent identifier for every
effect and parameter. Rewriting expressions to use matchName instead of
display names makes them portable across UI languages permanently — no more
converting back and forth every time a file changes hands between
language-mismatched teams.

## How it works

Unlike tools that rely on a pre-built CSV dictionary of effect/parameter
names, this script uses **the currently open project itself** as the
dictionary: it looks up the actual effect/parameter that's really applied,
right now, and reads its real matchName directly from the project. That
means:

- No external translation table to maintain.
- Works with any third-party plugin, not just first-party AE effects.
- Works even if you've renamed an effect instance for clarity — the script
  still finds it by its current display name before converting.

Two details matter for correctness:

- **The effect itself is addressed by numeric index**, not matchName.
  matchName only identifies the effect *type* — if a layer has multiple
  instances of the same effect (e.g. several renamed Hue/Saturation
  controls), matchName alone is ambiguous and can silently resolve to the
  wrong instance. A numeric index into `"ADBE Effect Parade"` uniquely
  identifies the specific instance.
- **The parameter is addressed by its own matchName**, not numeric index.
  Some effects (Hue/Saturation is the classic case) have an internally
  nested property structure, so a parameter's `propertyIndex` doesn't
  reliably match what the UI order suggests. matchName sidesteps this
  entirely.

## Requirements

- Run the AE UI in the **same language** the expressions were originally
  written in. Name resolution depends on the current UI language matching
  the text already in the expression.

## Usage

1. **Always work on a copy of the project file.** Do not run on a
   production `.aep` directly.
2. In the timeline, select the property/properties whose expression you
   want to convert — click the "Expression: ..." row(s). Multiple
   selection is supported.
3. Run `C7_ExpressionToMatchName.jsx` (`File > Scripts > Run Script
   File...`).
4. The script defaults to `DRY_RUN = true` — it only reports what it
   *would* convert, without writing anything. Check the log, then set
   `DRY_RUN = false` at the top of the script to actually convert.
5. A log file is written to `_matchName_logs/` next to your project file
   (or next to the script if the project hasn't been saved yet).
6. Changes are wrapped in a single Undo group — `Ctrl+Z` / `Cmd+Z`
   immediately after running reverts everything (only before saving).

### If a conversion goes wrong

`C7_RevertToOriginalExpression.jsx` restores the original expression from
the comment left by the converter. Select the converted property row(s)
and run it — anything without the conversion marker is left untouched.

### Scope options

Set `TARGET_SCOPE` at the top of the script:

| Value | Behaviour |
|---|---|
| `"selectedProperties"` (default) | Only the selected expression properties. Fastest, recommended. |
| `"selectedLayers"` | All expressions on the selected layers. |
| `"activeComp"` | All expressions in the active composition. |
| `"all"` | Entire project. Can be slow on large projects — prefer scanning comp by comp. |

## What it doesn't handle

- Indirect references through a variable, e.g.
  `var l = thisComp.layer("X"); l.effect(...)`.
- Effects renamed to something that no longer matches any standard name —
  wait, this *is* handled (the script always looks up by whatever name is
  currently on the effect), but if the expression text itself references a
  name that no longer matches anything currently applied, it's left
  unresolved and logged.

Unresolved references are never modified — they're only reported in the log.

## Files

- `C7_ExpressionToMatchName.jsx` — the converter.
- `C7_RevertToOriginalExpression.jsx` — reverts a conversion back to the
  original expression.

---

# c7 エクスプレッション → matchName 変換ツール

After Effectsのエクスプレッション内にある「エフェクト名・パラメーター名」の
**UI表示名参照(言語依存)**を、**matchName参照(言語非依存)**に変換します。
日本語版・英語版どちらのAEで開いても、同じエクスプレッションが壊れずに動く
ようになります。

```
変換前: thisComp.layer("CONTROL").effect("ドロップシャドウ")("不透明度")
変換後: thisComp.layer("CONTROL")("ADBE Effect Parade")(3)("ADBE Drop Shadow-0002")
```

元のエクスプレッションは、変換後の式の直前に必ずコメントとして残ります。

## なぜ必要か

日本語UIで書かれた `effect("ドロップシャドウ")("不透明度")` のような式は、
同じプロジェクトを英語UIのAEで開いた瞬間にエラーになります(逆も同様)。
表示名がそもそも別の言語では存在しないためです。

`matchName` は、すべてのエフェクト・パラメーターに割り振られた、UI言語に
依存しないAE内部の識別子です。表示名の代わりにmatchNameで参照するように
書き換えれば、言語の異なるチーム間でファイルをやり取りするたびに変換し
直す必要がなくなり、恒久的に対応できます。

## 仕組み

あらかじめ用意した「エフェクト名・パラメーター名の対応表(CSV等)」に頼る
方式とは異なり、このスクリプトは**今開いているプロジェクト自体**を辞書として
使います。実際にそのレイヤーに適用されているエフェクト・パラメーターを、
その場で直接探し、実物のmatchNameを読み取ります。つまり:

- 外部の対応表を用意・メンテナンスする必要がありません。
- 標準エフェクトだけでなく、サードパーティのプラグインにも対応します。
- 分かりやすさのためにエフェクト名をリネームしていても、現在の表示名で
  正しく探し当ててから変換します。

正確に変換するために、次の2点がポイントです:

- **エフェクト自体は数値インデックスで指定**します(matchNameではありません)。
  matchNameは「エフェクトの種類」を表すだけなので、同じ種類のエフェクトを
  同一レイヤーに複数(リネームして使い分けている場合など)適用していると、
  matchNameだけでは区別がつかず、誤った側に繋がってしまうことがあります。
  `"ADBE Effect Parade"` 内の数値インデックスなら、その1個を一意に指定できます。
- **パラメーターは、そのパラメーター自身のmatchName文字列で指定**します
  (数値インデックスではありません)。色相彩度(Hue/Saturation)のように内部
  構造が入れ子になっているエフェクトでは、パラメーターの `propertyIndex`
  がUI上の見た目の順番とズレることがあるため、これを回避します。

## 実行条件

- エクスプレッションが書かれた言語と**同じUI言語**のAEで実行してください。
  名前の照合は、現在のUI言語と式の中の文字列が一致していることが前提です。

## 使い方

1. **必ずプロジェクトファイルのコピーで作業してください。** 本番の `.aep`
   に直接実行しないでください。
2. タイムラインで、変換したいプロパティ(「Expression: ○○」の行)を選択
   します。複数選択も可能です。
3. `C7_ExpressionToMatchName.jsx` を実行します
   (`ファイル > スクリプト > スクリプトファイルを実行`)。
4. デフォルトは `DRY_RUN = true`(判定のみ・書き換えなし)です。ログを確認
   したら、スクリプト冒頭の `DRY_RUN = false` に変更して実際に変換します。
5. ログファイルは、プロジェクトファイルの隣の `_matchName_logs/` フォルダ
   に保存されます(未保存プロジェクトの場合はスクリプトの隣)。
6. 変更は1つのUndoグループにまとまっているので、実行直後なら `Ctrl+Z` /
   `Cmd+Z` で全体を取り消せます(保存前のみ)。

### 変換に失敗した場合

`C7_RevertToOriginalExpression.jsx` を使うと、変換時にコメントとして
残しておいた元の式に復元できます。変換済みのプロパティ行を選択して実行
してください(変換マーカーが無いものはそのままスキップされます)。

### 対象範囲のオプション

スクリプト冒頭の `TARGET_SCOPE` で指定します:

| 値 | 動作 |
|---|---|
| `"selectedProperties"`(デフォルト) | 選択したエクスプレッションプロパティのみ。最速・推奨。 |
| `"selectedLayers"` | 選択レイヤー内の全エクスプレッション。 |
| `"activeComp"` | アクティブなコンプ内の全エクスプレッション。 |
| `"all"` | プロジェクト全体。大規模プロジェクトでは遅くなることがあるため、コンプ単位での実行を推奨。 |

## 対応していないもの

- 変数経由の間接参照(例: `var l = thisComp.layer("X"); l.effect(...)`)。
- エクスプレッション内の参照名が、現在そのレイヤーに適用されているどの
  エフェクトの表示名とも一致しない場合(リネーム後に式を更新し忘れている
  等)。この場合は書き換えず、ログに未解決として記録されます。

未解決の参照は一切変更されず、ログに記録されるのみです。

## ファイル構成

- `C7_ExpressionToMatchName.jsx` — 変換本体。
- `C7_RevertToOriginalExpression.jsx` — 変換を元の式に戻す復元ツール。
