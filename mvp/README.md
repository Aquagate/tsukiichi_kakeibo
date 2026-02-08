# Tsukiichi Kakeibo MVP

MoneyForwardの家計簿（明細）と資産推移をローカルで取り込み、ダッシュボード・月次集計・明細一覧を表示するMVPです。IndexedDBへ保存するため外部送信は行いません。

## 実行手順

### 1. ローカルサーバーで開く（推奨）

```bash
cd mvp
npm install
npm run dev
```

ブラウザで表示されたURLにアクセスしてください。

> ※ `xlsx` ライブラリを同梱しているため、依存インストール後はCSV/XLSXともにオフラインで取り込み可能です。
> ※ 日本語CSVはShift_JISの可能性があるため、UTF-8で失敗した場合は自動的にShift_JISで再読込します。

## 主要ファイルと役割

- `index.html` : 画面構成（データ取込/ダッシュボード/明細一覧/集計）
- `src/main.js` : 画面イベントと描画ロジック（CSVは依存ライブラリなしで動作）
- `src/style.css` : 画面のスタイル
- `sample-data/*.csv` : サンプル入力データ

## サンプルデータ読み込み確認

1. `sample-data/transactions_sample.csv` を「家計簿（明細）」へ取込
2. `sample-data/assets_sample.csv` を「資産推移」へ取込
3. ダッシュボードに今月収支/主要カテゴリ/資産スナップショットが表示されることを確認
4. 「明細一覧」と「月次集計」が更新されることを確認

> MVP段階では年金・予測・イベント等の将来シミュレーションは未実装です。次フェーズで追加します。
