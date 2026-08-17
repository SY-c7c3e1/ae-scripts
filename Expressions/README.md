# Expressions

`ExpressionToMatchName/` や `MarkerCopy/` などが完成した「スクリプト(.jsx)」を
置く場所なのに対して、ここは **After Effects のエクスプレッション(コード片)** だけを
集める場所。ツールではなく、レイヤーの各プロパティに直接貼り付けて使うコードのスニペット集。

チャットで相談しながら少しずつ追加・整理していく想定なので、最初は空でも良い。

## 構成

カテゴリごとにサブフォルダを切り、1スニペット = 1ファイルで置く。

```
Expressions/
  Position/
  Opacity/
  Time/
  Text/
  Loop/
  Utility/
```

各ファイルは先頭にコメントで用途・使い方を書き、その下にエクスプレッション本体を書く。

```js
// wiggle() をレイヤーのスケールに適用し、拡大縮小のみランダムに揺らす
// 使い方: Scale プロパティに貼り付け、freq/amp を調整する
var freq = 2;
var amp = 20;
value + wiggle(freq, amp) * [0, 0];
```

ファイル名は内容がわかる英語のスラッグ + `.jsx`(例: `wiggle-scale-only.jsx`)。

## テストについて

ここに置くのは AE 上で直接使うコード片のため、`testing/` のオフラインテスト対象には含めない
(`ExpressionToMatchName/` や `MarkerCopy/` のような .jsx スクリプト本体とは別枠)。
