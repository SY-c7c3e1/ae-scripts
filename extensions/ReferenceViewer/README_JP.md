# Reference Viewer

After Effectsの画面上で、リファレンス画像・資料・Webリンク・メモを
**プロジェクトごとに**管理・閲覧できるパネル（CEP拡張機能）。
旧 `FileViewer`（テキスト抽出ビューワー）の置き換え。

> 開発中（ステップ1: 土台）。対応状況は下の「今後の予定」を参照。

## できること

- 画像・PDF・テキスト・その他のファイル、Webリンクをリファレンス一覧に登録
  - 「＋ファイル」ボタン、またはエクスプローラーからパネルへドラッグ＆ドロップ
  - 「＋リンク」でタイトルとURLを登録
- 一覧で選ぶと画像をパネル内に表示／ダブルクリックで外部アプリ・ブラウザで開く
- 右クリック：外部アプリで開く／フォルダを開く／名前を変更／一覧から外す（元に戻せる）
- ドラッグで並び替え
- メモ欄（名前・歌詞・進行メモなど）。自動保存

## データの保存場所

一覧とメモは **`.aep` ファイルの中**（プロジェクトのメタデータ）に保存される。

- プロジェクトを開くと自動で読み込まれる。別のプロジェクトに切り替えると、パネルの内容も切り替わる
- 「ファイルを収集」やコピーで `.aep` を移しても消えない
- **AEでプロジェクトを保存したときに確定する。** 保存せずに閉じた場合に備えて、
  パネル側にもバックアップを残しており、次に開いたとき「復元」を提案する
- ファイルは「登録時の場所」と「`.aep` からの相対位置」の両方を覚えている。
  プロジェクトフォルダごと移動・受け渡ししても、相対位置が同じなら見つけられる
- 拡張を入れていない人が開いても、エラーは出ない（一覧やメモが見えないだけ）

## インストール（Windows）

1. このフォルダ（`extensions/ReferenceViewer`）の `install_windows.bat` をダブルクリック
   - 署名なしの拡張機能を使えるようにする設定（初回のみ）と、
     `%APPDATA%\Adobe\CEP\extensions\ReferenceViewer` へのリンク作成を行う
   - リンクなので、このリポジトリを更新（git pull）すればパネルも最新になる
2. AEを再起動し、**[ウィンドウ] → [エクステンション] → [Reference Viewer]** を開く

手動で入れる場合:
1. レジストリ `HKEY_CURRENT_USER\Software\Adobe\CSXS.12`（AEのバージョンによって
   `CSXS.11` 〜 `CSXS.13`）に文字列値 `PlayerDebugMode` = `1` を追加
2. このフォルダを `%APPDATA%\Adobe\CEP\extensions\` にコピー

Macの場合: `defaults write com.adobe.CSXS.12 PlayerDebugMode 1` を実行し、
このフォルダを `~/Library/Application Support/Adobe/CEP/extensions/` にコピー。

## ファイル構成

```
ReferenceViewer/
  CSXS/manifest.xml             # 拡張機能の定義
  client/                       # パネルの画面（HTML/CSS/JS）
    index.html / style.css / main.js
    ReferenceViewer.core.js      # ロジック本体（Nodeでテスト可能）
  host/ReferenceViewer.host.jsx # AE側の処理（.aepへの保存、ファイル選択など）
  __tests__/                    # npm test で実行
  install_windows.bat
  .debug                        # 開発用（Chromeで http://localhost:8092 を開くとパネルをデバッグできる）
```

## 今後の予定

- [x] ステップ1: 一覧・リンク・メモの保存と復元、画像表示、並び替え
- [ ] ステップ2: ビューワー強化（画像の拡大縮小・移動、PDFのページ送り、テキスト表示）
- [ ] ステップ3: AEで読み込める形式を `_Reference` フォルダへ自動読み込み（⚙で切り替え）、
      収集後は読み込み済みフッテージの場所から表示
- [ ] ステップ4: メモとリンクを `_Reference_Memo` コンポにガイドレイヤーとして書き出し
      （拡張がない人でも読めるように）
