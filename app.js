/* React/ReactDOM は index.html の CDN から global で読み込む */
const { useState, useEffect, useRef, useMemo } = React;

/* ============================================================
   トークン（きっぷ / 発車案内の世界観）
   ink=藍色, paper=きっぷ紙, signal=駅名標の緑
   ============================================================ */
const C = {
  ink: "#17263A",
  inkSoft: "#33455F",
  inkLine: "#22334C",
  paper: "#F0EDE4",
  paperCard: "#FBFAF5",
  signal: "#0E8C81",
  signalBright: "#13A899",
  signalDim: "#0B6E66",
  amber: "#E29A3B",
  muted: "#8A93A0",
  line: "#DED9CC",
  danger: "#C0553E",
};
const MONO = 'ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, monospace';
const SANS =
  'system-ui, -apple-system, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", Meiryo, sans-serif';
const ROUND = '"M PLUS Rounded 1c", ' + SANS;

/* アプリのロゴ：一文字ずつ緑の丸で囲む（ド・コ・イ・ク）＋ ？ */
function Logo({ size = 34 }) {
  const chars = ["ド", "コ", "イ", "ク"];
  return (
    <div
      aria-label="ドコイク？"
      style={{ display: "inline-flex", alignItems: "center", gap: size * 0.16, flexWrap: "wrap", justifyContent: "center" }}
    >
      {chars.map((ch, i) => (
        <span
          key={i}
          style={{
            width: size, height: size, borderRadius: "50%",
            background: `radial-gradient(circle at 32% 26%, ${C.signalBright}, ${C.signal} 72%)`,
            boxShadow: `0 ${size * 0.08}px ${size * 0.24}px ${C.signal}44, inset 0 1px 2px rgba(255,255,255,.4)`,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontFamily: ROUND, fontWeight: 800, fontSize: size * 0.5,
            lineHeight: 1, flex: "0 0 auto", userSelect: "none",
          }}
        >
          {ch}
        </span>
      ))}
      <span style={{ fontFamily: ROUND, fontWeight: 800, fontSize: size * 0.82, color: C.signal, marginLeft: size * 0.02 }}>？</span>
    </div>
  );
}

/* ============================================================
   データ（東京・神奈川・埼玉・千葉 1518駅 / おでかけ先ネットワーク v2）
   RAW: i=id, n=駅名, p=県(0東京/1神奈川), r=searchPriority,
        f=dateFeature, s=dateScores(下記SCORE_KEYS順の19値)
   ADJ: 隣接駅グラフ（所要時間の経路計算用）
   ============================================================ */
const SCORE_KEYS = ["drinking","gourmet","cafe","shopping","entertainment","nature","walk","scenery","nightView","indoor","outdoor","rainyDay","active","relax","romantic","unique","lateNight","fullDay","shortStay"];
const AREA_LABEL = ["東京", "神奈川"];
const BASE_DEFAULT = "1130208"; // 新宿

// 隣接駅グラフは data/adjacency.json から起動時に読み込む
let ADJ = {};

// 駅データは data/stations.json から起動時に読み込む（各駅=1オブジェクト）
let DEFAULT_STATIONS = [];

/* ============================================================
   永続化（Artifact Persistent Storage → 無ければセッション保持）
   ============================================================ */
const STORE_KEY = "wheretogo:stations:v2";
async function loadStations() {
  try {
    if (typeof window !== "undefined" && window.storage) {
      const r = await window.storage.get(STORE_KEY);
      if (r && r.value) return JSON.parse(r.value);
    }
  } catch (e) { /* 初回/未対応時は既定データ */ }
  return null;
}
async function saveStations(list) {
  try {
    if (typeof window !== "undefined" && window.storage) {
      await window.storage.set(STORE_KEY, JSON.stringify(list));
    }
  } catch (e) { /* 保存不可でもセッション内は動作 */ }
}

/* ============================================================
   ロジック（絶対条件フィルタ / 任意条件の重み付け抽選）
   ============================================================ */
const NOW = Date.now();
const RECENT_MS = 30 * 24 * 60 * 60 * 1000;
const isRecent = (st) => st.lastVisit && NOW - Date.parse(st.lastVisit) < RECENT_MS;

// 絶対条件：searchPriority と 所要時間（＋訪問履歴）で候補から除外する
// priorityMode: standard=定番(P1) / hidden=穴場も(P1,2) / adventure=超冒険(P1,2,3)
const PRIORITY_SET = { standard: [1], hidden: [1, 2], adventure: [1, 2, 3] };
function applyHard(list, hf, timeMap, wishes) {
  const allowed = PRIORITY_SET[hf.priority] || PRIORITY_SET.standard;
  const wishKeys = wishes ? Object.keys(wishes) : [];
  return list.filter((st) => {
    if (!allowed.includes(st.pr)) return false;
    if (hf.timeOn) {
      const t = timeMap[st.id];
      const upper = hf.timeMax >= 120 ? Infinity : hf.timeMax;
      if (t == null || t < hf.timeMin || t > upper) return false;
    }
    // 履歴：only=行ってない場所だけ（訪問済み除外）／prefer=優先（除外せず10件抽選で重み）／all=気にしない
    if (hf.history === "only" && st.visited) return false;
    // 絶対条件フェーズの気分＝絞り込み：on は 4以上、top（長押し=最優先）は 5 のみ。
    for (const k of wishKeys) {
      const need = wishes[k] === "top" ? 5 : 4;
      if ((st.scores[k] || 0) < need) return false;
    }
    return true;
  });
}

// 任意条件フェーズ: 除外せず抽選確率だけ極端に上げる重み付け
// 平均スコア(1..5)を 3.2^(avg-3) に変換（3で等倍、5で約10倍、4で約3.2倍、1で約0.1倍）
function wishKeysOf(wishes) {
  if (!wishes) return [];
  return Array.isArray(wishes) ? wishes : Object.keys(wishes);
}
function weightOf(st, wishes) {
  const keys = wishKeysOf(wishes);
  if (!keys.length) return 1;
  let sum = 0;
  keys.forEach((k) => { sum += st.scores[k] || 3; });
  const avg = sum / keys.length;
  return Math.pow(3.2, avg - 3);
}
function pickWeighted(pool, wishes) {
  if (!pool.length) return null;
  const weights = pool.map((st) => weightOf(st, wishes));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
  return pool[pool.length - 1];
}

// プールからランダムに n 件（重複なし）
function sample(pool, n) {
  const a = [...pool];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}
// 希望条件の重みでランダムに n 件（重複なし）。希望なしなら均等。
function sampleWeighted(pool, wishes, n) {
  if (!wishKeysOf(wishes).length) return sample(pool, n);
  const items = [...pool];
  const out = [];
  while (out.length < n && items.length) {
    const w = items.map((s) => weightOf(s, wishes));
    const total = w.reduce((a, b) => a + b, 0);
    let r = Math.random() * total, idx = 0;
    for (; idx < items.length; idx++) { r -= w[idx]; if (r <= 0) break; }
    idx = Math.min(idx, items.length - 1);
    out.push(items[idx]);
    items.splice(idx, 1);
  }
  return out;
}

// 汎用：重み関数 wfn(st)>0 で 1 件を抽選
function pickBy(pool, wfn) {
  if (!pool.length) return null;
  const w = pool.map((s) => Math.max(0, wfn(s)));
  const total = w.reduce((a, b) => a + b, 0);
  if (total <= 0) return pool[Math.floor(Math.random() * pool.length)];
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i]; }
  return pool[pool.length - 1];
}
// 汎用：重み関数で n 件（重複なし）
function sampleBy(pool, n, wfn) {
  const items = [...pool];
  const out = [];
  while (out.length < n && items.length) {
    const w = items.map((s) => Math.max(0, wfn(s)));
    const total = w.reduce((a, b) => a + b, 0);
    let idx;
    if (total <= 0) { idx = Math.floor(Math.random() * items.length); }
    else { let r = Math.random() * total; for (idx = 0; idx < items.length; idx++) { r -= w[idx]; if (r <= 0) break; } idx = Math.min(idx, items.length - 1); }
    out.push(items[idx]); items.splice(idx, 1);
  }
  return out;
}
// 任意条件フェーズ(10→1)の重み：選択した気分スコア(1..5)の掛け算。未選択なら等倍(=完全ランダム)。
function softWeight(st, softWishes) {
  if (!softWishes || !softWishes.length) return 1;
  let w = 1;
  softWishes.forEach((k) => { w *= (st.scores[k] || 1); });
  return w;
}
// 履歴「行ってない場所を優先」：行った回数に応じて 0.7^visitCount（10件の絞り込みにだけ効かせる）
function historyWeight(st, hf) {
  return hf.history === "prefer" ? Math.pow(0.7, st.visitCount || 0) : 1;
}
const prefersReduce = () =>
  typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Cookie ヘルパー（出発駅などの保存用） */
function getCookie(name) {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1") + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : null;
}
function setCookie(name, value, days) {
  if (typeof document === "undefined") return;
  const exp = new Date(Date.now() + (days || 365) * 864e5).toUTCString();
  document.cookie = name + "=" + encodeURIComponent(value) + "; expires=" + exp + "; path=/; SameSite=Lax";
}
const BASE_COOKIE = "dokoiku_base";

// 出発駅からの所要時間（隣接グラフのダイクストラ・概算／乗換ペナルティなし）
function shortestTimes(sourceId) {
  const dist = { [sourceId]: 0 };
  const done = {};
  const pq = [[0, sourceId]];
  while (pq.length) {
    let mi = 0;
    for (let i = 1; i < pq.length; i++) if (pq[i][0] < pq[mi][0]) mi = i;
    const [d, u] = pq.splice(mi, 1)[0];
    if (done[u]) continue;
    done[u] = true;
    const ns = ADJ[u] || [];
    for (const [v, w] of ns) {
      const nd = d + w;
      if (dist[v] == null || nd < dist[v]) { dist[v] = nd; pq.push([nd, v]); }
    }
  }
  return dist;
}

// 希望条件のUI定義（グループ・絵文字・ラベル・dateScoresキー）
const WISH_GROUPS = [
  { title: "食べる・飲む", items: [["drinking", "🍺 飲みに行きたい"], ["gourmet", "🍽 ご飯を楽しみたい"], ["cafe", "☕ カフェに行きたい"]] },
  { title: "遊ぶ", items: [["shopping", "🛍 買い物したい"], ["entertainment", "🎮 何かして遊びたい"], ["nature", "🌿 自然に行きたい"], ["walk", "🚶 ぶらぶらしたい"], ["scenery", "🌆 景色を見たい"], ["nightView", "🌃 夜景を見たい"]] },
  { title: "今日の気分", items: [["relax", "😴 まったりしたい"], ["active", "🏃 アクティブに"], ["romantic", "💕 デートっぽく"], ["unique", "💎 ちょっと変わった"]] },
  { title: "今日の状況", items: [["rainyDay", "☔ 雨でも楽しみたい"], ["indoor", "🏠 屋内がいい"], ["outdoor", "☀️ 外で遊びたい"], ["lateNight", "🌙 夜から遊びたい"], ["fullDay", "🗓 一日遊びたい"], ["shortStay", "⏱ 少しだけ"]] },
];
// 結果カードで見せる相性（選んだ希望のうちスコアの高いもの）
function matchTags(st, wishes) {
  const label = {};
  WISH_GROUPS.forEach((g) => g.items.forEach(([k, l]) => { label[k] = l.replace(/^[^\s]+\s/, ""); }));
  const keys = wishes ? Object.keys(wishes) : [];
  return keys
    .map((k) => ({ k, label: label[k], score: st.scores[k] || 3, top: wishes[k] === "top" }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((x) => ({ label: x.label, mark: x.top ? "★" : (x.score >= 4 ? "◎" : "○") }));
}

/* ミッション（結果画面で 1〜3 個をランダム生成） */
const MISSIONS = [
  { c: "📸 記録・写真", t: "今日一番の写真を1枚撮る" },
  { c: "📸 記録・写真", t: "2人で写真を撮る" },
  { c: "📸 記録・写真", t: "今日一番笑った瞬間を写真に残す" },
  { c: "📸 記録・写真", t: "「なんかいい」と思った景色を撮る" },
  { c: "📸 記録・写真", t: "お互いに相手のベストショットを撮る" },
  { c: "📸 記録・写真", t: "同じものをそれぞれの視点で撮る" },
  { c: "📸 記録・写真", t: "今日一番変だったものを撮る" },
  { c: "📸 記録・写真", t: "SNSに載せたくなる写真を1枚撮る" },
  { c: "📸 記録・写真", t: "あえて映えない写真を撮る" },
  { c: "📸 記録・写真", t: "今日を象徴するものを1枚撮る" },
  { c: "📸 記録・写真", t: "帰る直前に写真を1枚撮る" },
  { c: "📸 記録・写真", t: "5年後に見返したい写真を撮る" },
  { c: "🆕 挑戦・初体験", t: "今日何か1つ初めてのことをする" },
  { c: "🆕 挑戦・初体験", t: "普段なら選ばないものを1つ選ぶ" },
  { c: "🆕 挑戦・初体験", t: "少しだけ勇気がいることをやる" },
  { c: "🆕 挑戦・初体験", t: "苦手なことに1回挑戦する" },
  { c: "🆕 挑戦・初体験", t: "相手が選んだことに文句を言わず乗ってみる" },
  { c: "🆕 挑戦・初体験", t: "気になったことをその場でやってみる" },
  { c: "🆕 挑戦・初体験", t: "「また今度」を1つ今日やる" },
  { c: "🆕 挑戦・初体験", t: "入ったことのないタイプの場所に入る" },
  { c: "🆕 挑戦・初体験", t: "普段なら通り過ぎる場所に立ち寄る" },
  { c: "🆕 挑戦・初体験", t: "知らないものを1つ試す" },
  { c: "🆕 挑戦・初体験", t: "いつもと違う選択を3回する" },
  { c: "🆕 挑戦・初体験", t: "今日だけは優柔不断をやめて即決する" },
  { c: "🆕 挑戦・初体験", t: "逆に、普段即決するものをじっくり選ぶ" },
  { c: "🆕 挑戦・初体験", t: "ちょっと恥ずかしいことを1つやる" },
  { c: "🆕 挑戦・初体験", t: "相手がおすすめするものを試す" },
  { c: "🆕 挑戦・初体験", t: "「絶対選ばない」と思った方をあえて選ぶ" },
  { c: "🆕 挑戦・初体験", t: "今日の予定を途中で1回変更する" },
  { c: "🆕 挑戦・初体験", t: "帰るまでに「初めてだった」と言えることを作る" },
  { c: "🔍 発見・探索", t: "今日一番面白いものを見つける" },
  { c: "🔍 発見・探索", t: "今日一番変なものを見つける" },
  { c: "🔍 発見・探索", t: "見たことのないものを3つ見つける" },
  { c: "🔍 発見・探索", t: "気になる路地を1本歩いてみる" },
  { c: "🔍 発見・探索", t: "面白い看板を見つける" },
  { c: "🔍 発見・探索", t: "変な名前を見つける" },
  { c: "🔍 発見・探索", t: "その街ならではのものを1つ見つける" },
  { c: "🔍 発見・探索", t: "一番落ち着く場所を探す" },
  { c: "🔍 発見・探索", t: "一番テンションが上がる場所を探す" },
  { c: "🔍 発見・探索", t: "隠れた良スポットを1つ見つける" },
  { c: "🔍 発見・探索", t: "「なんでこれあるんだろう？」を1つ見つける" },
  { c: "🔍 発見・探索", t: "一番古そうなものを探す" },
  { c: "🔍 発見・探索", t: "一番新しそうなものを探す" },
  { c: "🔍 発見・探索", t: "次回来たい場所を1つ見つける" },
  { c: "🔍 発見・探索", t: "今日初めて知ったことを1つ持ち帰る" },
  { c: "🎲 偶然・運任せ", t: "何か1回、直感だけで決める" },
  { c: "🎲 偶然・運任せ", t: "迷ったら右に進む" },
  { c: "🎲 偶然・運任せ", t: "迷ったら左に進む" },
  { c: "🎲 偶然・運任せ", t: "じゃんけんで何か1つ決める" },
  { c: "🎲 偶然・運任せ", t: "相手に行き先を1回丸投げする" },
  { c: "🎲 偶然・運任せ", t: "目に入った気になるものに近づいてみる" },
  { c: "🎲 偶然・運任せ", t: "予定になかった場所に1ヶ所入る" },
  { c: "🎲 偶然・運任せ", t: "その場のノリで何か1つ決める" },
  { c: "🎲 偶然・運任せ", t: "二択になったら普段選ばない方を選ぶ" },
  { c: "🎲 偶然・運任せ", t: "「せーの」で指差した方向へ進む" },
  { c: "🎲 偶然・運任せ", t: "最初に「面白そう」と言ったものをやる" },
  { c: "🎲 偶然・運任せ", t: "今日1回だけ「考えずに決める」" },
  { c: "🎲 偶然・運任せ", t: "予定を1つ捨てて、その場で新しい予定を作る" },
  { c: "👫 2人・会話", t: "相手の意外な一面を1つ見つける" },
  { c: "👫 2人・会話", t: "相手の知らなかった話を1つ聞く" },
  { c: "👫 2人・会話", t: "お互いの第一印象を話す" },
  { c: "👫 2人・会話", t: "次に行きたい場所を1つずつ決める" },
  { c: "👫 2人・会話", t: "相手に今日一番やりたいことを聞く" },
  { c: "👫 2人・会話", t: "昔ハマっていたものについて話す" },
  { c: "👫 2人・会話", t: "子どもの頃の話を1つする" },
  { c: "👫 2人・会話", t: "もし100万円あったら何するか話す" },
  { c: "👫 2人・会話", t: "お互いの最近のマイブームを教える" },
  { c: "👫 2人・会話", t: "今日の相手の良かったところを1つ伝える" },
  { c: "👫 2人・会話", t: "10年後何してそうか予想する" },
  { c: "👫 2人・会話", t: "今日一番楽しかったことを帰る前に発表する" },
  { c: "😂 ネタ・くだらない", t: "今日一番ダサいものを探す" },
  { c: "😂 ネタ・くだらない", t: "一番変なポーズで写真を撮る" },
  { c: "😂 ネタ・くだらない", t: "変な看板と一緒に写真を撮る" },
  { c: "😂 ネタ・くだらない", t: "100円以内で一番いらないものを探す" },
  { c: "😂 ネタ・くだらない", t: "今日見つけたものに勝手に名前をつける" },
  { c: "😂 ネタ・くだらない", t: "一番高そうなものを予想する" },
  { c: "😂 ネタ・くだらない", t: "一番安そうなものを予想する" },
  { c: "😂 ネタ・くだらない", t: "「誰が買うんだこれ」を探す" },
  { c: "😂 ネタ・くだらない", t: "今日一番しょうもない発見を発表する" },
  { c: "😂 ネタ・くだらない", t: "お互いを動物に例える" },
  { c: "😂 ネタ・くだらない", t: "その街に勝手なキャッチコピーをつける" },
  { c: "😂 ネタ・くだらない", t: "今日を映画にするならタイトルを決める" },
  { c: "😂 ネタ・くだらない", t: "今日一番意味不明だったものを決める" },
  { c: "🏆 ミニゲーム・勝負", t: "赤いものを先に5個見つけた方が勝ち" },
  { c: "🏆 ミニゲーム・勝負", t: "犬を先に見つけた方が勝ち" },
  { c: "🏆 ミニゲーム・勝負", t: "珍しい名字を先に見つけた方が勝ち" },
  { c: "🏆 ミニゲーム・勝負", t: "面白い看板を先に見つけた方が勝ち" },
  { c: "🏆 ミニゲーム・勝負", t: "相手を先に3回笑わせた方が勝ち" },
  { c: "🏆 ミニゲーム・勝負", t: "一番高い建物を先に見つけた方が勝ち" },
  { c: "🏆 ミニゲーム・勝負", t: "「これ絶対相手好きそう」を1つずつ探す" },
  { c: "🏆 ミニゲーム・勝負", t: "500円以内で相手が一番喜びそうなものを探す" },
  { c: "🏆 ミニゲーム・勝負", t: "今日のベストスポットをそれぞれ1ヶ所選ぶ" },
  { c: "🏆 ミニゲーム・勝負", t: "今日一番良かった写真を1枚ずつ出して勝負する" },
  { c: "🏆 ミニゲーム・勝負", t: "お互いに「今日一番○○だったもの」を当てる" },
  { c: "🎨 自由", t: "今日のお出かけにタイトルをつける" },
  { c: "🎨 自由", t: "今日を漢字一文字で表す" },
  { c: "🎨 自由", t: "今日のテーマソングを1曲決める" },
  { c: "🎨 自由", t: "今日起きたことを3行でまとめる" },
  { c: "🎨 自由", t: "今日の満足度を最後に100点満点で採点する" },
  { c: "🎨 自由", t: "「今日やってよかった」と思えることを1つ作る" },
];

/* カウントの数値をなめらかに変える */
function useTween(value, dur = 450) {
  const [disp, setDisp] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current, b = value;
    if (a === b) { setDisp(b); return; }
    let raf;
    const step = (t) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisp(Math.round(a + (b - a) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = b;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, dur]);
  return disp;
}

/* ============================================================
   小さなUI部品
   ============================================================ */
/* 2つのつまみで範囲（min〜max）を選ぶバー */
function RangeSlider({ min = 0, max = 120, step = 5, valueMin, valueMax, onChange }) {
  const span = max - min || 1;
  const pct = (v) => ((v - min) / span) * 100;
  const setLo = (v) => onChange(Math.min(v, valueMax - step), valueMax);
  const setHi = (v) => onChange(valueMin, Math.max(v, valueMin + step));
  return (
    <div style={{ position: "relative", height: 40 }}>
      <div style={{ position: "absolute", left: 11, right: 11, top: 17, height: 6, borderRadius: 6, background: C.line }} />
      <div
        style={{
          position: "absolute", top: 17, height: 6, borderRadius: 6, background: C.signal,
          left: `calc(11px + (100% - 22px) * ${pct(valueMin) / 100})`,
          width: `calc((100% - 22px) * ${(pct(valueMax) - pct(valueMin)) / 100})`,
        }}
      />
      <input className="rng" type="range" min={min} max={max} step={step} value={valueMin}
        onMouseDown={() => { if (typeof window !== "undefined" && window.Sfx) window.Sfx.unlock(); }}
        onChange={(e) => setLo(+e.target.value)} aria-label="最短" />
      <input className="rng" type="range" min={min} max={max} step={step} value={valueMax}
        onChange={(e) => setHi(+e.target.value)} aria-label="最長" />
    </div>
  );
}
function Chip({ active, onClick, children, danger }) {
  return (
    <button
      onClick={onClick}
      style={{
        appearance: "none",
        border: `1.5px solid ${active ? C.signal : C.line}`,
        background: active ? C.signal : C.paperCard,
        color: active ? "#fff" : C.ink,
        borderRadius: 999,
        padding: "11px 16px",
        fontFamily: SANS,
        fontSize: 15,
        fontWeight: active ? 700 : 500,
        cursor: "pointer",
        transition: "all .15s ease",
        boxShadow: active ? `0 2px 0 ${C.signalDim}` : "none",
      }}
    >
      {children}
    </button>
  );
}

function FieldLabel({ eyebrow, title }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, color: C.signal, fontWeight: 700 }}>
        {eyebrow}
      </div>
      <div style={{ fontFamily: SANS, fontSize: 16, fontWeight: 700, color: C.ink, marginTop: 2 }}>{title}</div>
    </div>
  );
}

/* 今日の気分（希望条件）チップ群：STEP1・STEP3で共用 */
/* 気分チップ：タップ=4以上に絞る / 長押し=★最優先(5のみ) */
function WishChip({ label, state, onToggle, onTop }) {
  const timer = useRef(null);
  const longRef = useRef(false);
  const start = () => {
    longRef.current = false;
    timer.current = setTimeout(() => {
      longRef.current = true;
      if (typeof window !== "undefined" && window.Sfx) { window.Sfx.unlock(); window.Sfx.plus(); }
      onTop();
    }, 450);
  };
  const end = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  const click = () => {
    if (longRef.current) { longRef.current = false; return; } // 長押し後のクリックは無視
    if (typeof window !== "undefined" && window.Sfx) { window.Sfx.unlock(); window.Sfx.tap(); }
    onToggle();
  };
  const top = state === "top";
  const on = state === "on" || top;
  const bg = top ? C.amber : on ? C.signal : C.paperCard;
  const fg = on ? "#fff" : C.ink;
  const bd = top ? C.amber : on ? C.signal : C.line;
  return (
    <button
      onPointerDown={start}
      onPointerUp={end}
      onPointerLeave={end}
      onPointerCancel={end}
      onClick={click}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        appearance: "none", border: `1.5px solid ${bd}`, background: bg, color: fg,
        borderRadius: 999, padding: "11px 16px", fontFamily: SANS, fontSize: 15,
        fontWeight: on ? 700 : 500, cursor: "pointer", transition: "all .15s ease",
        boxShadow: on ? `0 2px 0 ${top ? "#b9791f" : C.signalDim}` : "none",
        touchAction: "manipulation", userSelect: "none", WebkitUserSelect: "none",
      }}
    >
      {top ? "★ " : ""}{label}
    </button>
  );
}
function WishPicker({ wishes, onToggle, onTop }) {
  return (
    <>
      {WISH_GROUPS.map((g) => (
        <div key={g.title}>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, color: C.signal, fontWeight: 700, margin: "12px 0 8px" }}>
            {g.title}
          </div>
          <Row>
            {g.items.map(([k, label]) => (
              <WishChip key={k} label={label} state={wishes[k]} onToggle={() => onToggle(k)} onTop={() => onTop(k)} />
            ))}
          </Row>
        </div>
      ))}
    </>
  );
}
/* 任意条件フェーズ用：タップのみの重み付けピッカー（絞り込みなし） */
function SoftWishPicker({ selected, onToggle }) {
  return (
    <>
      {WISH_GROUPS.map((g) => (
        <div key={g.title}>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, color: C.signal, fontWeight: 700, margin: "12px 0 8px" }}>
            {g.title}
          </div>
          <Row>
            {g.items.map(([k, label]) => (
              <Chip key={k} active={selected.includes(k)} onClick={() => { if (typeof window !== "undefined" && window.Sfx) { window.Sfx.unlock(); window.Sfx.tap(); } onToggle(k); }}>{label}</Chip>
            ))}
          </Row>
        </div>
      ))}
    </>
  );
}

/* 発車案内風カウント */
function Board({ count, note }) {
  const n = useTween(count);
  return (
    <div style={{
      background: C.ink, borderRadius: 18, padding: "22px 18px", textAlign: "center",
      boxShadow: `inset 0 0 0 1px ${C.inkLine}, 0 10px 30px -18px rgba(23,38,58,.6)`,
    }}>
      <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 3, color: C.signalBright, fontWeight: 700 }}>
        CANDIDATES ・ 候補
      </div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 8, marginTop: 6 }}>
        <span style={{ fontFamily: MONO, fontSize: 64, fontWeight: 700, color: "#fff", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          {String(n).padStart(2, "0")}
        </span>
        <span style={{ fontFamily: SANS, fontSize: 18, color: "#B9C3CE", fontWeight: 600 }}>件</span>
      </div>
      {note && (
        <div style={{ fontFamily: SANS, fontSize: 13, color: C.signalBright, marginTop: 8, fontWeight: 600 }}>
          {note}
        </div>
      )}
    </div>
  );
}

/* 候補カード */
function StationCard({ st, index, dim, highlight, excludedMark, onToggleExclude, timeText }) {
  const hasActions = !!onToggleExclude;
  const faded = dim || excludedMark;
  return (
    <div
      style={{
        width: "100%", textAlign: "left",
        background: C.paperCard, borderRadius: 16, padding: "16px 18px",
        border: `2px solid ${highlight ? C.signal : C.line}`,
        boxShadow: highlight ? `0 8px 22px -12px ${C.signalDim}` : "0 2px 8px -6px rgba(23,38,58,.35)",
        opacity: faded ? 0.42 : 1, transition: "all .18s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 1.5, color: C.signal, fontWeight: 700 }}>
          {index != null ? `NO.${index + 1}` : st.area}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 12, color: C.muted }}>{timeText || st.area}</div>
      </div>
      <div style={{
        fontFamily: SANS, fontSize: 26, fontWeight: 800, color: C.ink, margin: "4px 0 6px", letterSpacing: 0.5,
        textDecoration: excludedMark ? "line-through" : "none", textDecorationColor: C.muted,
      }}>
        {st.name}
      </div>
      {st.dateFeature && (
        <div style={{ fontFamily: SANS, fontSize: 13.5, color: C.inkSoft, lineHeight: 1.5 }}>
          {st.dateFeature}
        </div>
      )}
      {hasActions && (
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          {onToggleExclude && (
            <button onClick={onToggleExclude} style={{
              flex: 1, padding: "10px", borderRadius: 10, cursor: "pointer",
              border: `1.5px solid ${excludedMark ? C.signal : C.line}`,
              background: excludedMark ? C.signal : C.paper,
              color: excludedMark ? "#fff" : C.danger,
              fontFamily: SANS, fontSize: 14, fontWeight: 700,
            }}>{excludedMark ? "候補に戻す" : "ここは嫌だ"}</button>
          )}
        </div>
      )}
    </div>
  );
}

/* 抽選機：駅名が高速で切り替わり、減速して「ガコン」と止まる */
function Reveal({ names, targetName, onDone }) {
  const [display, setDisplay] = useState(names[0] || targetName);
  const [locked, setLocked] = useState(false);
  const [spin, setSpin] = useState(0); // ティックごとに増える（リールの落下モーション用）
  useEffect(() => {
    // 表示がしっかり切り替わるよう、重複を除いた候補プールを用意（最低2件）
    let pool = Array.from(new Set((names && names.length ? names : [targetName])));
    if (pool.length < 2) pool = pool.concat(["…", targetName]);
    const reduce = prefersReduce();      // 視差軽減時も「止まる」のではなく、ゆっくり回す
    let alive = true, timer;
    let elapsed = 0, delay = reduce ? 95 : 55;
    const tick = () => {
      if (!alive) return;
      // 直前と同じ名前は避けて必ず切り替わって見せる
      setDisplay((cur) => {
        let n = pool[Math.floor(Math.random() * pool.length)];
        if (n === cur) n = pool[(pool.indexOf(cur) + 1) % pool.length];
        return n;
      });
      setSpin((s) => s + 1);
      if (typeof window !== "undefined" && window.Sfx) window.Sfx.tick(); // 回転のカチカチ音
      elapsed += delay;
      if (elapsed > 1900) delay += 26;             // 少し回してから減速（短め）
      if (delay > 240 || elapsed > 3200) {          // 着地
        setDisplay(targetName); setLocked(true);
        if (typeof window !== "undefined" && window.Sfx) window.Sfx.win(); // きまり！の音
        timer = setTimeout(() => alive && onDone(), 650);
        return;
      }
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, delay);
    return () => { alive = false; clearTimeout(timer); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fade" style={{ paddingTop: 8 }}>
      <div style={{
        background: C.ink, borderRadius: 22, padding: "44px 20px 46px", textAlign: "center",
        boxShadow: `inset 0 0 0 1px ${C.inkLine}, 0 16px 44px -22px rgba(23,38,58,.75)`,
      }}>
        <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: 5, color: C.signalBright, fontWeight: 700 }}>
          {locked ? "きまり！" : "抽選中"}
        </div>
        <div style={{ height: 24 }} />
        <div style={{ height: 64, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          <div
            key={locked ? "lock" : "spin-" + spin}
            className={locked ? "" : "reel"}
            style={{
              fontFamily: SANS, fontWeight: 900, color: "#fff", letterSpacing: 1, lineHeight: 1.1,
              fontSize: locked ? 54 : 38,
              animation: locked ? "pop .55s cubic-bezier(.2,.9,.2,1) both" : undefined,
              padding: "2px 4px",
            }}
          >
            {display}
          </div>
        </div>
        <div style={{ height: 22 }} />
        {locked ? (
          <div style={{ fontFamily: SANS, fontSize: 14, color: C.signalBright, fontWeight: 700 }}>きっぷを発券中…</div>
        ) : (
          <div style={{ fontFamily: MONO, fontSize: 18, color: "#7E8CA0", letterSpacing: 4 }}>
            <span className="dot">●</span><span className="dot">●</span><span className="dot">●</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* きっぷ（結果） */
function Ticket({ st, timeText, wishes = [] }) {
  const tags = matchTags(st, wishes);
  const prLabel = st.pr === 1 ? "王道" : st.pr === 2 ? "穴場" : "冒険";
  return (
    <div style={{ position: "relative", filter: "drop-shadow(0 18px 30px rgba(23,38,58,.28))" }}>
      <div style={{
        background: C.paperCard, borderRadius: 20, overflow: "hidden",
        border: `1px solid ${C.line}`,
      }}>
        {/* 上部：ヘッダ帯 */}
        <div style={{ background: C.ink, padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: MONO, fontSize: 12, letterSpacing: 3, color: C.signalBright, fontWeight: 700 }}>きっぷ ・ TICKET</span>
          <span style={{ fontFamily: MONO, fontSize: 12, color: "#9FB0C0" }}>{new Date().toLocaleDateString("ja-JP")}</span>
        </div>
        {/* 本体 */}
        <div style={{ padding: "26px 20px 8px" }}>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 3, color: C.signal, fontWeight: 700, textAlign: "center" }}>
            今日はここへ
          </div>
          <div style={{ fontFamily: SANS, fontSize: 44, fontWeight: 900, color: C.ink, textAlign: "center", margin: "6px 0 4px", letterSpacing: 1 }}>
            {st.name}
          </div>
          {st.dateFeature && (
            <div style={{ fontFamily: SANS, fontSize: 14, color: C.inkSoft, textAlign: "center", lineHeight: 1.55, padding: "0 4px" }}>
              {st.dateFeature}
            </div>
          )}
          {tags.length > 0 && (
            <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
              {tags.map((t) => (
                <span key={t.label} style={{ fontFamily: SANS, fontSize: 12.5, color: C.signalDim, background: "rgba(14,140,129,.1)", borderRadius: 999, padding: "4px 10px", fontWeight: 700 }}>
                  {t.label} {t.mark}
                </span>
              ))}
            </div>
          )}
        </div>
        {/* 破線＋パンチ穴 */}
        <div style={{ position: "relative", height: 24, margin: "12px 0" }}>
          <div style={{ position: "absolute", top: "50%", left: 22, right: 22, borderTop: `2px dashed ${C.line}` }} />
          <span style={punch("left")} /><span style={punch("right")} />
        </div>
        {/* 情報行 */}
        <div style={{ padding: "6px 20px 22px", display: "flex", justifyContent: "space-around", textAlign: "center" }}>
          <Info k="エリア" v={st.area} />
          <Info k="所要" v={timeText || "—"} />
          <Info k="タイプ" v={prLabel} />
        </div>
      </div>
    </div>
  );
}
const punch = (side) => ({
  position: "absolute", top: 0, [side]: -12, width: 24, height: 24, borderRadius: "50%",
  background: C.paper, boxShadow: `inset 0 0 0 2px ${C.line}`,
});
function Info({ k, v }) {
  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 2, color: C.muted }}>{k}</div>
      <div style={{ fontFamily: SANS, fontSize: 15, fontWeight: 700, color: C.ink, marginTop: 3 }}>{v}</div>
    </div>
  );
}

/* 全幅ボタン */
function Btn({ onClick, children, kind = "primary", disabled }) {
  const styles = {
    primary: { bg: C.signal, fg: "#fff", bd: C.signal, sh: `0 3px 0 ${C.signalDim}` },
    dark: { bg: C.ink, fg: "#fff", bd: C.ink, sh: `0 3px 0 #0d1826` },
    ghost: { bg: "transparent", fg: C.ink, bd: C.line, sh: "none" },
  }[kind];
  return (
    <button
      onClick={(e) => { if (typeof window !== "undefined" && window.Sfx) { window.Sfx.unlock(); window.Sfx.tap(); } if (onClick) onClick(e); }}
      disabled={disabled}
      style={{
        width: "100%", padding: "16px", borderRadius: 14, cursor: disabled ? "not-allowed" : "pointer",
        background: styles.bg, color: styles.fg, border: `1.5px solid ${styles.bd}`,
        fontFamily: SANS, fontSize: 17, fontWeight: 700, boxShadow: disabled ? "none" : styles.sh,
        opacity: disabled ? 0.45 : 1, transition: "transform .1s ease",
      }}
    >
      {children}
    </button>
  );
}

/* ミッション生成（結果画面）：1〜3個をランダムに出す */
function MissionBox() {
  const [n, setN] = useState(1);
  const [list, setList] = useState(null);
  const generate = () => {
    if (window.Sfx) { window.Sfx.unlock(); window.Sfx.win(); }
    setList(sample(MISSIONS, n));
  };
  return (
    <div style={{ background: C.paperCard, border: `1.5px solid ${C.line}`, borderRadius: 16, padding: "16px 16px 18px" }}>
      <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, color: C.signal, fontWeight: 700 }}>MISSION</div>
      <div style={{ fontFamily: SANS, fontSize: 17, fontWeight: 800, color: C.ink, margin: "2px 0 4px" }}>今日のミッション</div>
      <p style={{ fontFamily: SANS, fontSize: 12.5, color: C.inkSoft, margin: "0 0 12px", lineHeight: 1.6 }}>
        おでかけがちょっと楽しくなるお題を、ランダムで出します。
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontFamily: SANS, fontSize: 13, color: C.inkSoft, fontWeight: 600 }}>個数</span>
        {[1, 2, 3].map((v) => (
          <Chip key={v} active={n === v} onClick={() => { if (window.Sfx) { window.Sfx.unlock(); window.Sfx.tap(); } setN(v); }}>{v}個</Chip>
        ))}
      </div>
      <Btn kind="dark" onClick={generate}>🎯 ミッションを生成</Btn>
      {list && (
        <div className="fade" style={{ display: "grid", gap: 10, marginTop: 14 }}>
          {list.map((m, i) => (
            <div key={i} className="deal" style={{ animationDelay: `${i * 70}ms`, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.signal, fontWeight: 700, marginBottom: 3 }}>{m.c}</div>
              <div style={{ fontFamily: SANS, fontSize: 15.5, fontWeight: 700, color: C.ink, lineHeight: 1.5 }}>{m.t}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   メイン
   ============================================================ */
function App() {
  const [stations, setStations] = useState(DEFAULT_STATIONS);
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState("title"); // title home step1 step2 step3 draw final result manage
  const [hf, setHf] = useState({ priority: "standard", timeOn: true, timeMin: 0, timeMax: 60, history: "prefer" });
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moodOpen, setMoodOpen] = useState(false); // STEP1「その他の絶対条件」の折りたたみ
  const [base, setBase] = useState(BASE_DEFAULT);
  const [hardWishes, setHardWishes] = useState({}); // 絶対条件フェーズ(STEP1)：絞り込み { key:"on"(4以上)|"top"(5のみ) }
  const [softWishes, setSoftWishes] = useState([]); // 任意条件フェーズ(STEP3)：重み付けのみ [key,...]
  // 結果表示（相性タグ）用に両方を合成
  const shownWishes = useMemo(() => {
    const m = { ...hardWishes };
    softWishes.forEach((k) => { if (!m[k]) m[k] = "on"; });
    return m;
  }, [hardWishes, softWishes]);
  const [shown, setShown] = useState([]);
  const [excluded, setExcluded] = useState([]);
  const [chosen, setChosen] = useState(null);
  const [rerollUsed, setRerollUsed] = useState(false);
  const [revealNames, setRevealNames] = useState([]);
  const [revealTarget, setRevealTarget] = useState("");
  const [lastRecordedId, setLastRecordedId] = useState(null); // 結果画面「ココイク」で+1済みの駅（重複+1防止）
  const [lastChosen, setLastChosen] = useState(null); // 直前にメイン検索で選ばれた駅（ココイッタ登録の初期表示用・resetでは消さない）
  const [chosenHistory, setChosenHistory] = useState([]); // メイン検索で選ばれた駅の履歴（新しい順・重複なし）

  // 初期ロード（駅データ＋出発駅）
  useEffect(() => {
    (async () => {
      const saved = await loadStations();
      if (saved && Array.isArray(saved) && saved.length) setStations(saved);
      try {
        // 出発駅は Cookie から復元（無ければ旧 window.storage → 既定）
        const c = getCookie(BASE_COOKIE);
        if (c) setBase(c);
        else if (typeof window !== "undefined" && window.storage) {
          const b = await window.storage.get("wheretogo:base:v1");
          if (b && b.value) setBase(b.value);
        }
      } catch (e) { /* 既定の出発駅 */ }
      setReady(true);

      // クラウド（Supabase）から訪問回数を復元。設定時のみ／失敗しても表示は維持。
      try {
        const SH = typeof window !== "undefined" ? window.SupaHistory : null;
        if (SH && (await SH.ready())) {
          const summary = await SH.getCountsSummary();
          setStations((cur) => cur.map((s) => {
            const e = summary[s.id];
            return e ? { ...s, visited: true, visitCount: e.count, lastVisit: e.lastVisit } : s;
          }));
        }
      } catch (e) { /* クラウド未設定/失敗時はローカル表示のまま */ }
    })();
  }, []);
  // 画面が切り替わったら必ず一番上から表示する（前の画面のスクロール位置を引き継がない）
  useEffect(() => {
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  }, [screen]);

  // 保存
  const persist = (next) => { setStations(next); saveStations(next); };
  const setBaseAndSave = (id) => {
    setBase(id);
    setCookie(BASE_COOKIE, id, 365); // 出発駅を Cookie に保存（1年）
    try { if (typeof window !== "undefined" && window.storage) window.storage.set("wheretogo:base:v1", id); } catch (e) { /* noop */ }
  };

  // 出発駅からの所要時間マップ（出発駅が変わった時だけ再計算）
  const timeMap = useMemo(() => shortestTimes(base), [base]);
  const baseName = useMemo(() => {
    const b = stations.find((s) => s.id === base);
    return b ? b.name : "新宿";
  }, [stations, base]);
  const timeText = (st) => {
    const t = timeMap[st.id];
    return t == null ? "経路なし" : `約${t}分`;
  };

  const candidates = useMemo(() => applyHard(stations, hf, timeMap, hardWishes), [stations, hf, timeMap, hardWishes]);
  const count = candidates.length;
  const hardWishKeyCount = Object.keys(hardWishes).length;

  const resetFlow = () => {
    setHf({ priority: "standard", timeOn: true, timeMin: 0, timeMax: 60, history: "prefer" });
    setHardWishes({}); setSoftWishes([]); setShown([]); setExcluded([]); setChosen(null); setRerollUsed(false);
    setLastRecordedId(null); setMenuOpen(false); setSettingsOpen(false);
    setScreen("home");
  };
  const goHome = () => { setMenuOpen(false); setSettingsOpen(false); setScreen("home"); };
  const navTo = (s) => { setMenuOpen(false); setSettingsOpen(false); setScreen(s); };

  // 【絶対条件フェーズ/STEP1】タップ：off ⇄ on（4以上に絞る）。選択中(on/top)ならoff。
  const toggleHardWish = (k) => setHardWishes((cur) => {
    const next = { ...cur };
    if (next[k]) delete next[k]; else next[k] = "on";
    return next;
  });
  // 【絶対条件フェーズ/STEP1】長押し：最優先(top＝5のみ)。既にtopならoff。
  const topHardWish = (k) => setHardWishes((cur) => {
    const next = { ...cur };
    if (next[k] === "top") delete next[k]; else next[k] = "top";
    return next;
  });
  // 【任意条件フェーズ/STEP3】タップのみ：重み付け用に選択/解除。
  const toggleSoftWish = (k) => setSoftWishes((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  const toggleExclude = (st) => setExcluded((cur) => (cur.includes(st.id) ? cur.filter((x) => x !== st.id) : [...cur, st.id]));

  // ① 絶対条件で候補を出す → 10件を表示（「行ってない場所を優先」時は 0.7^行った回数 で重み付け）
  const search10 = () => {
    setShown(sampleBy(candidates, 10, (s) => historyWeight(s, hf)));
    setExcluded([]); setChosen(null); setScreen("pick10");
  };

  // 今日の気分（任意条件フェーズ）画面へ
  const goWishes = () => setScreen("step3");

  const reroll = () => {
    if (rerollUsed) return;
    setShown(sampleBy(candidates, 10, (s) => historyWeight(s, hf)));
    setExcluded([]); setChosen(null); setRerollUsed(true); setScreen("pick10");
  };

  // 10件（「ここは嫌だ」除外後）から1件。気分未選択なら完全ランダム、選択なら気分スコアの積で重み付け。
  const runReveal = (pool) => {
    if (!pool.length) return;
    const target = pickBy(pool, (s) => softWeight(s, softWishes));
    setChosen(target);
    setLastChosen(target);
    setChosenHistory((h) => [target, ...h.filter((x) => x.id !== target.id)].slice(0, 30));
    setRevealNames(pool.map((p) => p.name));
    setRevealTarget(target.name);
    setScreen("reveal");
  };
  // STEP3「この気分で1つ決める」：いま出ている10件（除外を除く）から決める
  const decideWithWishes = () => runReveal(shown.filter((s) => !excluded.includes(s.id)));

  // 「行った」記録：訪問回数+1・最終訪問日を今日に
  const recordVisit = (st) => {
    const next = stations.map((x) =>
      x.id === st.id ? { ...x, visited: true, visitCount: x.visitCount + 1, lastVisit: new Date().toISOString().slice(0, 10) } : x
    );
    persist(next);
    setChosen((c) => (c && c.id === st.id ? next.find((n) => n.id === st.id) : c));
  };

  if (!ready) {
    return <Shell><div style={{ textAlign: "center", padding: 60, fontFamily: MONO, color: C.muted }}>読み込み中…</div></Shell>;
  }

  return (
    <Shell>

      {/* ヘッダ：ロゴ / パンくず / ホームアイコン / ハンバーガー */}
      {screen !== "title" && (
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={goHome} style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0, display: "flex", alignItems: "center" }}>
            <Logo size={26} />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <HomeIconBtn onClick={goHome} />
            <button
              aria-label="メニュー"
              onClick={() => { if (window.Sfx) { window.Sfx.unlock(); window.Sfx.tap(); } setMenuOpen(true); }}
              style={{
                width: 40, height: 40, borderRadius: 12, border: `1.5px solid ${C.line}`,
                background: C.paperCard, cursor: "pointer", display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 20, lineHeight: 1, color: C.ink,
              }}
            >☰</button>
          </div>
        </div>
        <Breadcrumb screen={screen} onNav={navTo} />
      </div>
      )}

      {/* ハンバーガーメニュー */}
      {menuOpen && (
        <div style={modalWrap} onClick={() => setMenuOpen(false)}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontFamily: SANS, fontSize: 19, fontWeight: 800, color: C.ink }}>メニュー</div>
              <button onClick={() => setMenuOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: SANS, fontSize: 15, fontWeight: 700, color: C.muted }}>とじる ✕</button>
            </div>
            <MenuItem
              icon="⚙️" title="設定"
              desc="効果音のオン・オフを切り替えます。"
              onClick={() => { setMenuOpen(false); setSettingsOpen(true); }}
            />
            <div style={{ height: 10 }} />
            <MenuItem
              icon="📍" title="ココイッタ登録"
              desc="行った場所を記録して、回数を管理します。"
              onClick={() => { setMenuOpen(false); setScreen("manage"); }}
            />
          </div>
        </div>
      )}

      {/* 設定モーダル */}
      {settingsOpen && (
        <div style={modalWrap} onClick={() => setSettingsOpen(false)}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontFamily: SANS, fontSize: 19, fontWeight: 800, color: C.ink }}>設定</div>
              <button onClick={() => setSettingsOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: SANS, fontSize: 15, fontWeight: 700, color: C.muted }}>とじる ✕</button>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: C.paperCard, border: `1px solid ${C.line}`, borderRadius: 14, padding: "14px 16px" }}>
              <div>
                <div style={{ fontFamily: SANS, fontSize: 16, fontWeight: 700, color: C.ink }}>効果音</div>
                <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.inkSoft, marginTop: 2 }}>抽選やタップ時の音を鳴らします。</div>
              </div>
              <SoundToggle />
            </div>
          </div>
        </div>
      )}

      {screen === "title" && (
        <Fade key="title">
          <div style={{ minHeight: "76vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "32px 6px" }}>
            <Logo size={62} />
            <p style={{ fontFamily: ROUND, fontSize: 13, fontWeight: 700, color: C.signalDim, letterSpacing: 4, margin: "24px 0 20px" }}>
              WHERE TO GO
            </p>
            <p style={{ fontFamily: SANS, fontSize: 15, color: C.inkSoft, lineHeight: 1.9, maxWidth: 320, margin: 0 }}>
              東京・神奈川・埼玉・千葉の1518駅から、<br />
              今日のおでかけ先をおまかせでご提案。<br />
              条件を選ぶだけ。迷わず、すぐ決まる。
            </p>
            <div style={{ height: 34 }} />
            <div style={{ width: "100%", maxWidth: 320 }}>
              <Btn onClick={() => setScreen("home")}>はじめる →</Btn>
            </div>
          </div>
        </Fade>
      )}

      {screen === "home" && (
        <Fade key="home">
          <h1 style={{ fontFamily: SANS, fontSize: 32, fontWeight: 900, color: C.ink, margin: "6px 0 6px", letterSpacing: 1 }}>
            今日はどこ行く？
          </h1>
          <p style={{ fontFamily: SANS, fontSize: 15, color: C.inkSoft, margin: "0 0 22px" }}>
            考えるのは最低限。あとはおまかせ。
          </p>
          <Board count={count} />
          <div style={{ height: 20 }} />
          <Btn onClick={() => setScreen("step1")}>条件を選ぶ →</Btn>
          <div style={{ height: 12 }} />
          <Btn kind="ghost" onClick={search10}>おまかせで候補を出す →</Btn>
        </Fade>
      )}

      {screen === "step1" && (
        <Fade key="step1">
          <StepHead n="01" title="ゆずれない条件" sub="当てはまらない場所は、はじめから外します。選ばなくてもOK。" />
          <Board count={count} note={count === 0 ? "しぼりすぎかも" : count <= 6 ? "だいぶ絞れてきました" : null} />
          <div style={{ height: 22 }} />

          <FieldLabel eyebrow="FROM" title="どこから出かける？" />
          <BasePicker stations={stations} baseId={base} onPick={setBaseAndSave} />
          <div style={{ height: 18 }} />

          <FieldLabel eyebrow="TIME" title={`${baseName}からの所要時間`} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 9, marginBottom: hf.timeOn ? 6 : 18 }}>
            <Chip active={!hf.timeOn} onClick={() => setHf({ ...hf, timeOn: false })}>おまかせ</Chip>
            <Chip active={hf.timeOn} onClick={() => setHf({ ...hf, timeOn: true })}>時間で絞る</Chip>
          </div>
          {hf.timeOn && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontFamily: MONO, fontSize: 15, color: C.signal, fontWeight: 800, textAlign: "center", marginBottom: 2 }}>
                {hf.timeMin}分 〜 {hf.timeMax >= 120 ? "上限なし" : `${hf.timeMax}分`}
              </div>
              <RangeSlider
                valueMin={hf.timeMin}
                valueMax={hf.timeMax}
                onChange={(lo, hi) => setHf({ ...hf, timeMin: lo, timeMax: hi })}
              />
              <p style={{ fontFamily: SANS, fontSize: 11.5, color: C.muted, textAlign: "center", margin: "0" }}>
                ※所要時間は概算です（経路が分からない駅は対象外）
              </p>
            </div>
          )}

          <FieldLabel eyebrow="RANGE" title="どこまで攻める？" />
          <Row>
            <Chip active={hf.priority === "standard"} onClick={() => setHf({ ...hf, priority: "standard" })}>定番だけ</Chip>
            <Chip active={hf.priority === "hidden"} onClick={() => setHf({ ...hf, priority: "hidden" })}>穴場もいれる</Chip>
            <Chip active={hf.priority === "adventure"} onClick={() => setHf({ ...hf, priority: "adventure" })}>超冒険</Chip>
          </Row>

          <FieldLabel eyebrow="HISTORY" title="前に行った場所は？" />
          <Row>
            <Chip active={hf.history === "all"} onClick={() => setHf({ ...hf, history: "all" })}>行った場所もOK</Chip>
            <Chip active={hf.history === "prefer"} onClick={() => setHf({ ...hf, history: "prefer" })}>行ってない場所を優先</Chip>
            <Chip active={hf.history === "only"} onClick={() => setHf({ ...hf, history: "only" })}>行ってない場所だけ</Chip>
          </Row>
          <div style={{ height: 18 }} />

          {/* その他の絶対条件（旧・今日の気分）：折りたたみ */}
          <button
            onClick={() => { if (window.Sfx) { window.Sfx.unlock(); window.Sfx.tap(); } setMoodOpen((v) => !v); }}
            style={{
              width: "100%", textAlign: "left", background: C.paperCard, border: `1.5px solid ${C.line}`,
              borderRadius: 12, padding: "13px 15px", cursor: "pointer", display: "flex",
              justifyContent: "space-between", alignItems: "center", marginBottom: moodOpen ? 6 : 0,
            }}
          >
            <span>
              <span style={{ display: "block", fontFamily: MONO, fontSize: 11, letterSpacing: 2, color: C.signal, fontWeight: 700 }}>OTHER</span>
              <span style={{ display: "block", fontFamily: SANS, fontSize: 16, fontWeight: 700, color: C.ink, marginTop: 2 }}>
                その他の絶対条件{hardWishKeyCount > 0 ? `（${hardWishKeyCount}）` : ""}
              </span>
            </span>
            <span style={{ fontFamily: MONO, fontSize: 18, color: C.signal, fontWeight: 700 }}>{moodOpen ? "－" : "＋"}</span>
          </button>
          {moodOpen && (
            <div className="fade">
              <p style={{ fontFamily: SANS, fontSize: 12.5, color: C.inkSoft, margin: "4px 0 2px", lineHeight: 1.6 }}>
                <b>タップ</b>＝その条件が<b>しっかり当てはまる</b>駅だけに<b>絞り込みます</b>。<br />
                <b>長押し</b>＝<b style={{ color: C.amber }}>★最優先</b>になり、その条件が<b>いちばん当てはまる</b>駅だけにさらに絞り込みます。
              </p>
              <WishPicker wishes={hardWishes} onToggle={toggleHardWish} onTop={topHardWish} />
            </div>
          )}

          <div style={{ height: 26 }} />
          <Btn onClick={search10} disabled={count === 0}>この条件で候補を出す →</Btn>
          {count === 0 && (
            <p style={{ fontFamily: SANS, fontSize: 13, color: C.danger, textAlign: "center", marginTop: 12 }}>
              条件に合う場所がありません。条件を少しゆるめてください。
            </p>
          )}
        </Fade>
      )}

      {screen === "pick10" && (() => {
        const remaining = shown.filter((s) => !excluded.includes(s.id)).length;
        return (
        <Fade key="pick10">
          <StepHead n="02" title="今日の候補" sub="気が乗らない所は「ここは嫌だ」で外して、残りから1つ選びます。" />
          {shown.length === 0 ? (
            <div style={{ border: `2px dashed ${C.line}`, borderRadius: 16, padding: 20, background: C.paperCard, textAlign: "center" }}>
              <p style={{ fontFamily: SANS, fontSize: 15, color: C.inkSoft, margin: "0 0 14px" }}>
                候補がありません。条件をゆるめてください。
              </p>
              <Btn onClick={() => setScreen("step1")}>条件を見直す</Btn>
            </div>
          ) : (
            <>
              <div style={{ fontFamily: MONO, fontSize: 12, color: C.muted, marginBottom: 10 }}>
                のこり {remaining} 件
              </div>
              <div style={{ display: "grid", gap: 12 }}>
                {shown.map((st, i) => (
                  <div key={st.id} className="deal" style={{ animationDelay: `${i * 45}ms` }}>
                    <StationCard
                      st={st} index={i}
                      timeText={hf.timeOn ? timeText(st) : null}
                      excludedMark={excluded.includes(st.id)}
                      onToggleExclude={() => toggleExclude(st)}
                    />
                  </div>
                ))}
              </div>
              <div style={{ height: 22 }} />
              <Btn kind="dark" onClick={goWishes} disabled={remaining === 0}>
                ここから一つ決める →
              </Btn>
              {remaining === 0 && (
                <p style={{ fontFamily: SANS, fontSize: 13, color: C.danger, textAlign: "center", marginTop: 12 }}>
                  全部外しています。どれか戻すか、条件を足して選び直してください。
                </p>
              )}
            </>
          )}
        </Fade>
        );
      })()}

      {screen === "step3" && (() => {
        const pool = shown.filter((s) => !excluded.includes(s.id));
        const hasMood = softWishes.length > 0;
        return (
        <Fade key="step3">
          <StepHead n="03" title="今日の気分はありますか？" sub="ここは絞り込みません。気分は選んでも選ばなくてもOK。" />
          <div style={{
            background: hasMood ? "rgba(14,140,129,.08)" : C.paperCard,
            border: `1.5px solid ${hasMood ? C.signal : C.line}`, borderRadius: 14, padding: "13px 16px", marginBottom: 16,
          }}>
            <p style={{ fontFamily: SANS, fontSize: 13, color: C.ink, margin: 0, lineHeight: 1.7 }}>
              🎲 <b>気分を選ばない</b> → 残り{pool.length}件から<b>完全ランダム</b>で決めます。<br />
              💚 <b>気分を選ぶ</b> → 選んだ気分に<b>合う駅ほど当たりやすく</b>なります（重み付け）。<br />
              <span style={{ color: C.muted, fontSize: 12 }}>
                いまは{hasMood ? `気分を${softWishes.length}個選択中 → 重み付けで決定` : "未選択 → 完全ランダムで決定"}
              </span>
            </p>
          </div>
          <SoftWishPicker selected={softWishes} onToggle={toggleSoftWish} />
          <div style={{ height: 18 }} />
          <Btn onClick={decideWithWishes} disabled={pool.length === 0}>
            {hasMood ? "🎲 この気分で1つ決める！" : "🎲 ランダムで1つ決める！"}
          </Btn>
          {pool.length === 0 && (
            <p style={{ fontFamily: SANS, fontSize: 13, color: C.danger, textAlign: "center", marginTop: 12 }}>
              候補がありません。前の画面で戻すか、条件をゆるめてください。
            </p>
          )}
        </Fade>
        );
      })()}

      {screen === "reveal" && (
        <Reveal names={revealNames} targetName={revealTarget} onDone={() => setScreen("final")} />
      )}

      {screen === "final" && chosen && (
        <Fade key="final">
          <div className="reveal">
            <Ticket st={chosen} timeText={timeMap[chosen.id] != null ? timeText(chosen) : null} wishes={shownWishes} />
          </div>
          <p style={{ fontFamily: SANS, fontSize: 11.5, color: C.muted, textAlign: "center", margin: "10px 6px 0", lineHeight: 1.6 }}>
            ※所要時間は概算です（乗換・待ち時間は含みません）。実際の経路・所要時間・営業状況はご自身でお確かめください。
          </p>
          {(
            <a
              href={chosen.hotpepperUrl || "https://www.hotpepper.jp"}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => { if (typeof window !== "undefined" && window.Sfx) { window.Sfx.unlock(); window.Sfx.tap(); } }}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                width: "100%", boxSizing: "border-box", padding: "14px 16px", borderRadius: 14,
                marginTop: 16, background: "#fff", border: `1.5px solid ${C.amber}`, color: C.amber,
                fontFamily: SANS, fontSize: 15.5, fontWeight: 800, textDecoration: "none",
                boxShadow: `0 3px 0 ${C.amber}55`,
              }}
            >
              🍽 この駅でグルメを探す（ホットペッパー）
            </a>
          )}
          <div style={{ height: 22 }} />
          <VisitControl
            station={chosen}
            recorded={lastRecordedId === chosen.id}
            onRecorded={() => { recordVisit(chosen); setLastRecordedId(chosen.id); }}
          />
          <div style={{ height: 22 }} />
          <MissionBox />
          <div style={{ height: 16 }} />
          <Btn kind="ghost" onClick={goHome}>🏠 ホームに戻る</Btn>
        </Fade>
      )}

      {screen === "manage" && (
        <Manage
          stations={stations}
          onChange={persist}
          chosenHistory={chosenHistory}
          lastRecordedId={lastRecordedId}
          onClearRecorded={() => setLastRecordedId(null)}
        />
      )}
    </Shell>
  );
}

/* ============================================================
   Supabase 訪問履歴（クラウド保存・匿名認証）
   window.SupaHistory は supabase-client.js が定義。
   未設定/接続不可でもアプリ本体は通常動作（graceful degradation）。
   ============================================================ */
function VisitControl({ station, onRecorded, recorded }) {
  const [enabled, setEnabled] = useState(false);
  const [count, setCount] = useState(null); // null=不明/読み込み中
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  // すでに（この結果で）ココイク済みなら二重で+1できないようにする
  const done = !!recorded;

  // 駅が切り替わったら、その駅の訪問回数を取り直す
  useEffect(() => {
    let alive = true;
    setCount(null); setToast("");
    (async () => {
      const SH = typeof window !== "undefined" ? window.SupaHistory : null;
      if (!SH) { if (alive) setEnabled(false); return; }
      let ok = false;
      try { ok = await SH.ready(); } catch (e) { ok = false; }
      if (!alive) return;
      setEnabled(ok);
      if (ok) {
        try { const c = await SH.getVisitCount(station.id); if (alive) setCount(c); }
        catch (e) { if (alive) setCount(null); }
      }
    })();
    return () => { alive = false; };
  }, [station.id]);

  const onGo = async () => {
    if (saving || done) return;    // 連打・二重登録を防止
    setSaving(true); setToast("");
    const SH = typeof window !== "undefined" ? window.SupaHistory : null;
    try {
      if (enabled && SH) {
        await SH.addVisit(station.id);
        setCount((c) => (c == null ? 1 : c + 1)); // 表示回数を即時+1
        if (onRecorded) onRecorded();
        if (typeof window !== "undefined" && window.Sfx) window.Sfx.win();
        setToast("ココイク！ 記録しました（＋1）");
      } else {
        if (onRecorded) onRecorded();  // ローカルのみ更新
        setToast("この端末内にのみ記録しました（＋1・クラウド未接続）");
      }
    } catch (e) {
      setToast("記録に失敗しました。もう一度お試しください。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {enabled && (
        <div style={{ fontFamily: MONO, fontSize: 12, color: C.signal, fontWeight: 700, textAlign: "center", marginBottom: 8 }}>
          行った回数：{count == null ? "…" : count}回
        </div>
      )}
      <Btn kind="primary" onClick={onGo} disabled={saving || done}>
        {done ? "ココイク済み ✓" : (saving ? "記録中…" : "ここへ行く（ココイク）")}
      </Btn>
      {toast && (
        <p style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, textAlign: "center", marginTop: 10, color: toast.indexOf("失敗") >= 0 ? C.danger : C.signal }}>
          {toast}
        </p>
      )}
      {done && (
        <p style={{ fontFamily: SANS, fontSize: 11.5, color: C.muted, textAlign: "center", marginTop: 8 }}>
          この駅は＋1済みです。回数の増減は「ココイッタ」で調整できます。
        </p>
      )}
      {!enabled && !done && (
        <p style={{ fontFamily: SANS, fontSize: 11.5, color: C.muted, textAlign: "center", marginTop: 8 }}>
          クラウド保存は未設定のため、この端末内にのみ記録します
        </p>
      )}
    </div>
  );
}

/* ココイッタの1行。editable のときだけ ＋1/−1 を表示（増減はアニメで見せる） */
function VisitRow({ st, onAdd, onRemove, recorded, rank, editable }) {
  const [pop, setPop] = useState(null); // "＋1" / "−1"
  const prev = useRef(st.visitCount);
  useEffect(() => {
    if (st.visitCount !== prev.current) {
      setPop(st.visitCount > prev.current ? "＋1" : "−1");
      prev.current = st.visitCount;
      const t = setTimeout(() => setPop(null), 700);
      return () => clearTimeout(t);
    }
  }, [st.visitCount]);
  const up = pop === "＋1";
  return (
    <div style={{ background: C.paperCard, border: `1px solid ${recorded ? C.signal : C.line}`, borderRadius: 14, padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        {rank != null && <div style={{ fontFamily: MONO, fontSize: 12, color: C.muted, fontWeight: 700, minWidth: 22 }}>#{rank}</div>}
        <div style={{ fontFamily: SANS, fontSize: 18, fontWeight: 800, color: C.ink }}>{st.name}</div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: C.muted }}>{st.area}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4, position: "relative" }}>
        <span style={{ fontFamily: MONO, fontSize: 12, color: C.muted }}>行った回数：</span>
        <span key={st.visitCount} className={pop ? "countpop" : ""} style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: C.signal, fontVariantNumeric: "tabular-nums", minWidth: 20, textAlign: "center", display: "inline-block" }}>
          {st.visitCount}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 12, color: C.muted }}>回</span>
        {pop && (
          <span className="floatpop" style={{ position: "absolute", left: 70, top: -8, fontFamily: MONO, fontSize: 16, fontWeight: 800, color: up ? C.signalBright : C.danger, pointerEvents: "none" }}>
            {pop}
          </span>
        )}
        {st.lastVisit && <span style={{ fontFamily: MONO, fontSize: 11, color: C.muted, marginLeft: 6 }}>（最終 {st.lastVisit}）</span>}
      </div>
      {editable && recorded && (
        <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.signal, fontWeight: 700, marginTop: 6 }}>
          先ほどのココイクで＋1済み（重複登録を防止中）
        </div>
      )}
      {editable && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <SmallBtn onClick={() => { if (window.Sfx) { window.Sfx.unlock(); window.Sfx.plus(); } onAdd(st); }} disabled={recorded}>＋1</SmallBtn>
          <SmallBtn danger onClick={() => { if (window.Sfx) { window.Sfx.unlock(); window.Sfx.minus(); } onRemove(st); }} disabled={st.visitCount <= 0}>−1</SmallBtn>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   レイアウト部品
   ============================================================ */
function Shell({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: C.paper, padding: "22px 16px 48px" }}>
      <div style={{ maxWidth: 440, margin: "0 auto" }}>{children}</div>
    </div>
  );
}
function Row({ children }) {
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 9, marginBottom: 18 }}>{children}</div>;
}
function Fade({ children }) {
  return <div className="fade">{children}</div>;
}
function StepHead({ n, title, sub }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontFamily: MONO, fontSize: 13, color: C.signal, fontWeight: 700, letterSpacing: 2 }}>STEP {n}</span>
      </div>
      <h2 style={{ fontFamily: SANS, fontSize: 26, fontWeight: 900, color: C.ink, margin: "4px 0 4px" }}>{title}</h2>
      {sub && <p style={{ fontFamily: SANS, fontSize: 14, color: C.inkSoft, margin: 0 }}>{sub}</p>}
    </div>
  );
}
function SoundToggle() {
  const [on, setOn] = useState(typeof window !== "undefined" && window.Sfx ? window.Sfx.enabled : true);
  return (
    <button
      aria-label={on ? "音オン" : "音オフ"}
      onClick={() => {
        if (typeof window !== "undefined" && window.Sfx) {
          window.Sfx.unlock();
          const v = window.Sfx.toggle();
          setOn(v);
          if (v) window.Sfx.tap();
        } else { setOn(!on); }
      }}
      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "4px 4px" }}
    >
      {on ? "🔊" : "🔇"}
    </button>
  );
}
const miniLink = {
  background: "none", border: `1px solid ${C.line}`, borderRadius: 999, padding: "7px 14px",
  fontFamily: SANS, fontSize: 13, color: C.inkSoft, cursor: "pointer", fontWeight: 600,
};

/* ホームアイコン（常時表示） */
function HomeIconBtn({ onClick }) {
  return (
    <button
      aria-label="ホームへ"
      onClick={() => { if (window.Sfx) { window.Sfx.unlock(); window.Sfx.tap(); } onClick(); }}
      style={{
        width: 40, height: 40, borderRadius: 12, border: `1.5px solid ${C.line}`,
        background: C.paperCard, cursor: "pointer", display: "flex", alignItems: "center",
        justifyContent: "center", padding: 0,
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.signal} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v9h5v-5h4v5h5v-9" />
      </svg>
    </button>
  );
}

/* パンくずリスト（途中の項目をタップでその画面へ戻れる） */
const CRUMBS = {
  home: [["ホーム", "home"]],
  step1: [["ホーム", "home"], ["条件", "step1"]],
  pick10: [["ホーム", "home"], ["条件", "step1"], ["候補", "pick10"]],
  step3: [["ホーム", "home"], ["条件", "step1"], ["候補", "pick10"], ["今日の気分", "step3"]],
  reveal: [["ホーム", "home"], ["条件", "step1"], ["候補", "pick10"], ["結果", "final"]],
  final: [["ホーム", "home"], ["条件", "step1"], ["候補", "pick10"], ["結果", "final"]],
  manage: [["ホーム", "home"], ["ココイッタ", "manage"]],
};
function Breadcrumb({ screen, onNav }) {
  const items = CRUMBS[screen] || [["ホーム", "home"]];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4, marginTop: 10, fontFamily: MONO, fontSize: 11.5 }}>
      {items.map(([label, target], i) => {
        const last = i === items.length - 1;
        return (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            {i > 0 && <span style={{ color: C.muted }}>›</span>}
            {last ? (
              <span style={{ color: C.ink, fontWeight: 800 }}>{label}</span>
            ) : (
              <button
                onClick={() => { if (window.Sfx) { window.Sfx.unlock(); window.Sfx.tap(); } onNav(target); }}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: MONO, fontSize: 11.5, color: C.signal, fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 2 }}
              >{label}</button>
            )}
          </span>
        );
      })}
    </div>
  );
}

/* メニュー項目（アイコン・タイトル・1文説明） */
function MenuItem({ icon, title, desc, onClick }) {
  return (
    <button
      onClick={() => { if (window.Sfx) { window.Sfx.unlock(); window.Sfx.tap(); } onClick(); }}
      style={{
        width: "100%", textAlign: "left", background: C.paperCard, border: `1px solid ${C.line}`,
        borderRadius: 14, padding: "14px 16px", cursor: "pointer", display: "flex", gap: 12, alignItems: "center",
      }}
    >
      <span style={{ fontSize: 24, lineHeight: 1, flex: "0 0 auto" }}>{icon}</span>
      <span style={{ flex: 1 }}>
        <span style={{ display: "block", fontFamily: SANS, fontSize: 16, fontWeight: 800, color: C.ink }}>{title}</span>
        <span style={{ display: "block", fontFamily: SANS, fontSize: 12.5, color: C.inkSoft, marginTop: 2 }}>{desc}</span>
      </span>
      <span style={{ fontFamily: MONO, fontSize: 16, color: C.muted }}>›</span>
    </button>
  );
}

/* ============================================================
   駅管理
   ============================================================ */
function BasePicker({ stations, baseId, onPick }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const cur = stations.find((s) => s.id === baseId);
  const matches = useMemo(() => {
    const query = q.trim();
    if (!query) return [];
    return stations.filter((s) => s.name.includes(query)).slice(0, 8);
  }, [stations, q]);
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        width: "100%", textAlign: "left", background: C.paperCard, border: `1.5px solid ${C.line}`,
        borderRadius: 12, padding: "12px 14px", cursor: "pointer", fontFamily: SANS,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>{cur ? cur.name : "新宿"}</span>
        <span style={{ fontFamily: MONO, fontSize: 12, color: C.signal, fontWeight: 700 }}>変更</span>
      </button>
    );
  }
  return (
    <div style={{ background: C.paperCard, border: `1.5px solid ${C.signal}`, borderRadius: 12, padding: 12 }}>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="出発駅をさがす（例：横浜）"
        style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${C.line}`, background: "#fff", fontFamily: SANS, fontSize: 16, color: C.ink }} />
      <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
        {matches.map((s) => (
          <button key={s.id} onClick={() => { onPick(s.id); setOpen(false); setQ(""); }}
            style={{ textAlign: "left", background: "#fff", border: `1px solid ${C.line}`, borderRadius: 8, padding: "9px 12px", cursor: "pointer", fontFamily: SANS, fontSize: 15, color: C.ink }}>
            {s.name} <span style={{ color: C.muted, fontFamily: MONO, fontSize: 12 }}>{s.area}</span>
          </button>
        ))}
        {q.trim() && matches.length === 0 && (
          <div style={{ fontFamily: SANS, fontSize: 13, color: C.muted, padding: "6px 2px" }}>見つかりません</div>
        )}
      </div>
      <button onClick={() => { setOpen(false); setQ(""); }} style={{ marginTop: 8, background: "none", border: "none", color: C.muted, fontFamily: SANS, fontSize: 13, cursor: "pointer" }}>閉じる</button>
    </div>
  );
}

function Manage({ stations, onChange, chosenHistory, lastRecordedId, onClearRecorded }) {
  const [regOpen, setRegOpen] = useState(false); // 登録モーダルの開閉
  const [regQ, setRegQ] = useState("");         // 登録モーダルの検索
  const [q, setQ] = useState("");               // 一覧内の検索
  const [area, setArea] = useState("all");      // フィルタ（エリア）
  const [sort, setSort] = useState("count");    // 並び替え
  const today = new Date().toISOString().slice(0, 10);

  // ＋1：ローカル即時更新＋Supabaseへ1レコード追加
  const addOne = async (st) => {
    onChange(stations.map((x) => x.id === st.id
      ? { ...x, visited: true, visitCount: x.visitCount + 1, lastVisit: today } : x));
    const SH = typeof window !== "undefined" ? window.SupaHistory : null;
    if (SH) { try { if (await SH.ready()) await SH.addVisit(st.id); } catch (e) { /* ローカルのみ */ } }
  };
  // −1：ローカルを1減らし、Supabaseの最新1件を削除
  const removeOne = async (st) => {
    const cur = stations.find((x) => x.id === st.id);
    const nextCount = Math.max(0, (cur ? cur.visitCount : 0) - 1);
    onChange(stations.map((x) => x.id === st.id
      ? { ...x, visitCount: nextCount, visited: nextCount > 0, lastVisit: nextCount > 0 ? x.lastVisit : null } : x));
    if (lastRecordedId === st.id && onClearRecorded) onClearRecorded(); // 取り消したら重複ガード解除
    const SH = typeof window !== "undefined" ? window.SupaHistory : null;
    if (SH) { try { if (await SH.ready()) await SH.removeOneVisit(st.id); } catch (e) { /* ローカルのみ */ } }
  };

  // 登録モーダルの候補：検索文字があれば全駅から、無ければ「直前に選ばれた駅（履歴すべて）」
  const regResults = useMemo(() => {
    const query = regQ.trim();
    if (query) return stations.filter((s) => s.name.includes(query)).slice(0, 60);
    const hist = chosenHistory || [];
    return hist.map((c) => stations.find((s) => s.id === c.id) || c);
  }, [stations, regQ, chosenHistory]);

  // ココイッタ一覧（行った駅）：検索・フィルタ・ソート
  const visitedList = useMemo(() => {
    let arr = stations.filter((s) => s.visited);
    const query = q.trim();
    if (query) arr = arr.filter((s) => s.name.includes(query));
    if (area !== "all") arr = arr.filter((s) => s.area === area);
    arr = arr.slice();
    if (sort === "count") arr.sort((a, b) => b.visitCount - a.visitCount || (a.name < b.name ? -1 : 1));
    else if (sort === "recent") arr.sort((a, b) => String(b.lastVisit || "").localeCompare(String(a.lastVisit || "")));
    else arr.sort((a, b) => (a.name < b.name ? -1 : 1));
    return arr.slice(0, 300);
  }, [stations, q, area, sort]);

  const inputStyle = { width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 12, border: `1.5px solid ${C.line}`, background: "#fff", fontFamily: SANS, fontSize: 16, color: C.ink };

  return (
    <Fade key="manage">
      <StepHead n="—" title="ココイッタ" sub="行った場所の記録。回数が多い順にならびます。" />

      {/* ココイッタ登録ボタン → 小画面（モーダル）を開く */}
      <Btn kind="primary" onClick={() => { setRegOpen(true); setRegQ(""); }}>
        ＋ ココイッタを登録
      </Btn>

      {/* 登録モーダル：画面いっぱい。ここでだけ ＋1/−1 ができる */}
      {regOpen && (
        <div style={{ position: "fixed", inset: 0, background: C.paper, zIndex: 60, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 12px", borderBottom: `1px solid ${C.line}` }}>
            <div style={{ fontFamily: SANS, fontSize: 19, fontWeight: 800, color: C.ink }}>ココイッタを登録</div>
            <button onClick={() => setRegOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: SANS, fontSize: 15, fontWeight: 700, color: C.muted }}>とじる ✕</button>
          </div>
          <div style={{ padding: "12px 16px 6px" }}>
            <input value={regQ} onChange={(e) => setRegQ(e.target.value)} placeholder="駅名でさがして登録（例：横浜）" style={inputStyle} />
            <div style={{ fontFamily: MONO, fontSize: 12, color: C.muted, margin: "10px 2px 2px" }}>
              {regQ.trim() ? `「${regQ.trim()}」の検索結果` : (regResults.length ? "直前に選ばれた駅（新しい順）" : "まず「ドコイク？」で駅を決めると、ここに出ます")}
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "8px 16px 28px" }}>
            <div style={{ display: "grid", gap: 10 }}>
              {regResults.length === 0 && (
                <p style={{ fontFamily: SANS, fontSize: 13.5, color: C.inkSoft, textAlign: "center", padding: "16px 6px" }}>
                  {regQ.trim() ? "見つかりませんでした。" : "直前に選ばれた駅はありません。"}
                </p>
              )}
              {regResults.map((st) => (
                <VisitRow key={st.id} st={st} onAdd={addOne} onRemove={removeOne} recorded={lastRecordedId === st.id} editable />
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ height: 18 }} />

      {/* 一覧（閲覧専用）：検索・エリアフィルタ・並び替え。増減は登録から */}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="記録した駅から検索" style={inputStyle} />
      <div style={{ height: 12 }} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        <Chip active={area === "all"} onClick={() => setArea("all")}>すべて</Chip>
        <Chip active={area === "東京"} onClick={() => setArea("東京")}>東京</Chip>
        <Chip active={area === "神奈川"} onClick={() => setArea("神奈川")}>神奈川</Chip>
        <Chip active={area === "埼玉"} onClick={() => setArea("埼玉")}>埼玉</Chip>
        <Chip active={area === "千葉"} onClick={() => setArea("千葉")}>千葉</Chip>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <Chip active={sort === "count"} onClick={() => setSort("count")}>回数が多い順</Chip>
        <Chip active={sort === "recent"} onClick={() => setSort("recent")}>最近行った順</Chip>
        <Chip active={sort === "name"} onClick={() => setSort("name")}>駅名順</Chip>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {visitedList.length === 0 && (
          <p style={{ fontFamily: SANS, fontSize: 14, color: C.inkSoft, textAlign: "center", padding: "20px 6px", lineHeight: 1.6 }}>
            まだ記録がありません。「＋ ココイッタを登録」か、結果画面の「ココイク」で記録できます。
          </p>
        )}
        {visitedList.map((st, i) => (
          <VisitRow key={st.id} st={st} rank={sort === "count" ? i + 1 : null} />
        ))}
      </div>
    </Fade>
  );
}
function SmallBtn({ children, onClick, danger, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      flex: 1, padding: "9px", borderRadius: 10, cursor: disabled ? "not-allowed" : "pointer",
      border: `1px solid ${danger ? C.danger : C.line}`, background: danger ? "rgba(192,85,62,.06)" : C.paper,
      color: danger ? C.danger : C.ink, fontFamily: SANS, fontSize: 13, fontWeight: 700,
      opacity: disabled ? 0.4 : 1,
    }}>{children}</button>
  );
}
function TextField({ label, value, onChange, type = "text" }) {
  return (
    <label style={{ display: "block", marginBottom: 10 }}>
      <span style={{ fontFamily: SANS, fontSize: 13, color: C.inkSoft, fontWeight: 600 }}>{label}</span>
      <input
        type={type} value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%", boxSizing: "border-box", marginTop: 5, padding: "11px 12px", borderRadius: 10,
          border: `1.5px solid ${C.line}`, background: "#fff", fontFamily: SANS, fontSize: 16, color: C.ink,
        }}
      />
    </label>
  );
}
const modalWrap = {
  position: "fixed", inset: 0, background: "rgba(23,38,58,.5)", display: "flex",
  alignItems: "flex-end", justifyContent: "center", zIndex: 50, padding: 12,
};
const modalCard = {
  background: C.paper, borderRadius: 20, padding: 20, width: "100%", maxWidth: 440,
  maxHeight: "88vh", overflowY: "auto", boxShadow: "0 -10px 40px rgba(0,0,0,.25)",
};

/* エントリポイント：外部 JSON を読み込んでから描画 */
async function boot() {
  try {
    const [stationsData, adjData] = await Promise.all([
      fetch("data/stations.json").then((r) => r.json()),
      fetch("data/adjacency.json").then((r) => r.json()),
    ]);
    ADJ = adjData;
    DEFAULT_STATIONS = stationsData.map((s) => ({
      id: s.id,
      name: s.name,
      area: s.area,
      pr: s.searchPriority,
      dateFeature: s.dateFeature,
      scores: s.scores,
      hotpepperUrl: (s.hotpepperUrl && String(s.hotpepperUrl).indexOf("http") === 0) ? s.hotpepperUrl : "https://www.hotpepper.jp",
      visited: false,
      lastVisit: null,
      visitCount: 0,
    }));
  } catch (e) {
    document.getElementById("root").textContent =
      "データの読み込みに失敗しました（data/stations.json / data/adjacency.json）。";
    throw e;
  }
  ReactDOM.createRoot(document.getElementById("root")).render(
    React.createElement(React.StrictMode, null, React.createElement(App))
  );
}
boot();
