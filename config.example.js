/* Supabase 接続情報（公開用）テンプレート。
   使い方:
     1) このファイルを config.js としてコピー
     2) 自分の Supabase プロジェクトの値を設定
   ここに書くのは「公開用(anon public key)」だけ。
   service_role キー / secret キーは絶対に置かないこと。
   本番(GitHub Pages)では GitHub Actions が Secrets からこの config.js を生成します。 */
window.__SUPABASE__ = {
  url: "YOUR_SUPABASE_URL",
  anonKey: "YOUR_SUPABASE_ANON_KEY",
};
