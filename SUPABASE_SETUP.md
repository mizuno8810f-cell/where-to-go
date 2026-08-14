# Supabase 訪問履歴セットアップ手順

このアプリは静的サイト（GitHub Pages）のまま、Supabase の
**匿名認証（Anonymous Sign-In）** と **Database + RLS** を使って
「行った」履歴をクラウド保存します。駅マスターは従来どおりフロント内の
`data/stations.json` を使用し、Supabase にはユーザーの訪問履歴のみを保存します。

---

## 1. Supabase プロジェクトを用意

1. https://supabase.com でプロジェクトを作成
2. **Project Settings → API** で以下を控える（フロントで使うのは公開用のみ）
   - `Project URL` … `VITE_SUPABASE_URL` 相当（本アプリでは `url`）
   - `anon public` key … `VITE_SUPABASE_ANON_KEY` 相当（本アプリでは `anonKey`）
   - ⚠️ `service_role` key は**絶対にフロントに置かない／コミットしない**

## 2. 匿名認証を有効化（Dashboard）

- **Authentication → Sign In / Providers（Providers 設定）** で
  **「Anonymous sign-ins」を ON** にする。
  （これが OFF だと `signInAnonymously()` が失敗します）

## 3. テーブル + RLS を作成（SQL Editor）

**Supabase Dashboard → SQL Editor** に、下記 `sql/setup.sql` の全文を貼り付けて実行してください。
（このリポジトリの `sql/setup.sql` と同じ内容です）

## 4. ローカルで動かす場合

```bash
cp config.example.js config.js
# config.js を開き、url と anonKey を自分の値に置き換える
```
`config.js` は `.gitignore` 済みでコミットされません。

## 5. 本番（GitHub Pages）の環境変数

GitHub リポジトリ → **Settings → Secrets and variables → Actions → New repository secret** で:

- `SUPABASE_URL` = あなたの Project URL
- `SUPABASE_ANON_KEY` = あなたの anon public key

デプロイ時に GitHub Actions がこの 2 つから `config.js` を自動生成して公開します
（`.github/workflows/deploy.yml` の "Generate Supabase config" ステップ）。
anon public キーは静的サイトの性質上ブラウザから必ず見えますが、これは設計上の想定であり、
安全性は RLS（下記）で担保します。

## 6. 動作確認

1. 公開 URL を開く → 候補を出す → 結果画面で「行った！」を押す
2. 「行った回数：N回」が +1、「『行った！』に追加しました」が出る
3. ページを再読み込み／ブラウザ再起動しても回数が保持される
   （同じ匿名ユーザーが維持されるため）
4. 「ココイッタ」画面に「最近ココイッタ駅」が表示される

## 7. RLS が効いていることの確認（ユーザーA→Bの履歴が見えないこと）

手順は本文（チャット回答）の「9. RLS 動作確認」を参照。
別ブラウザ／シークレットウィンドウで別の匿名ユーザーを作り、
互いの履歴が取得できないことを確認します。
