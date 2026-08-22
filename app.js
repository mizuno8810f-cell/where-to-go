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
   データ（東京・神奈川・埼玉・千葉 1518レコード＝重複排除後1515駅 / おでかけ先ネットワーク v2）
   RAW: i=id, n=駅名, p=県(0東京/1神奈川), r=searchPriority,
        f=dateFeature, s=dateScores(下記SCORE_KEYS順の19値)
   ADJ: 隣接駅グラフ（所要時間の経路計算用）
   ============================================================ */
const SCORE_KEYS = ["drinking","gourmet","cafe","shopping","entertainment","nature","walk","scenery","nightView","indoor","outdoor","rainyDay","active","relax","romantic","unique","lateNight","fullDay","shortStay"];
const AREA_LABEL = ["東京", "神奈川"];
const BASE_DEFAULT = "1130208"; // 新宿
// 検索条件のデフォルト値（ホームに戻ると常にこの状態に戻す）
const DEFAULT_HF = { priority: "standard", timeOn: true, timeMin: 0, timeMax: 60, timePerBase: false, timeRanges: {}, history: "prefer" };

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
// timeFilters: [{ map, min, max }] 各出発駅ごとの所要時間マップと許容範囲
function applyHard(list, hf, timeFilters, wishes) {
  const allowed = PRIORITY_SET[hf.priority] || PRIORITY_SET.standard;
  const wishKeys = wishes ? Object.keys(wishes) : [];
  const filters = timeFilters && timeFilters.length ? timeFilters : [];
  return list.filter((st) => {
    if (!allowed.includes(st.pr)) return false;
    if (hf.timeOn && filters.length) {
      // すべての出発駅について、その駅の所要時間が範囲内であること
      for (const f of filters) {
        const t = f.map[st.id];
        const upper = f.max >= 120 ? Infinity : f.max;
        if (t == null || t < f.min || t > upper) return false; // 経路不明 or 範囲外は除外
      }
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

// 同じ駅（例：路線違いの「浅草」）を1件にまとめる。rank(小さいほど優先)で代表を選ぶ。
// キーは「駅名＋エリア」。同名でもエリアが違えば別の場所として残す（例：入谷=東京/神奈川）。
function dedupeByName(list, rank) {
  const keyOf = (st) => st.name + "" + (st.area || "");
  const best = new Map();
  for (const st of list) {
    const k = keyOf(st);
    const cur = best.get(k);
    if (!cur || rank(st) < rank(cur)) best.set(k, st);
  }
  const seen = new Set();
  const out = [];
  for (const st of list) {
    const k = keyOf(st);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(best.get(k));
  }
  return out;
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
// 王道度の効かせ方：種別ごとに変える。
//   定番だけ = 王道が濃く出る / 穴場も = ゆるく王道寄り / 超冒険 = 完全に均等
const ICONIC_POWER = { standard: 2, hidden: 1, adventure: 0 };
function iconicWeight(st, hf) {
  const p = ICONIC_POWER[hf.priority] || 0;
  if (!p) return 1;
  return Math.pow(st.iconic || 1, p);
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
// 気分キー → 表示名（絵文字を除いたもの）。緩和ヒントなどで使う。
const WISH_LABEL = {};
WISH_GROUPS.forEach((g) => g.items.forEach(([k, l]) => { WISH_LABEL[k] = l.replace(/^[^\s]+\s/, ""); }));

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

/* ミッション生成（結果画面）：1〜3個をランダムに出す。状態は App が保持（共有・復元のため） */
function MissionBox({ n, onN, list, onGenerate }) {
  const generate = () => {
    if (window.Sfx) { window.Sfx.unlock(); window.Sfx.win(); }
    onGenerate(sample(MISSIONS, n));
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
          <Chip key={v} active={n === v} onClick={() => { if (window.Sfx) { window.Sfx.unlock(); window.Sfx.tap(); } onN(v); }}>{v}個</Chip>
        ))}
      </div>
      <Btn kind="dark" onClick={generate}>{list ? "🎯 ミッションを引き直す" : "🎯 ミッションを生成"}</Btn>
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

/* 日別データを直近n日で0埋めして時系列配列にする */
function fillDays(rows, key, n) {
  const map = {};
  (rows || []).forEach((r) => { map[String(r.day)] = Number(r[key]) || 0; });
  const out = [];
  const base = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base); d.setDate(base.getDate() - i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push({ iso, label: `${d.getMonth() + 1}/${d.getDate()}`, value: map[iso] || 0 });
  }
  return out;
}

/* 軽量な日別バーグラフ（棒をタップでその日の値） */
function MiniBars({ data }) {
  const [sel, setSel] = useState(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((a, d) => a + d.value, 0);
  const H = 150;
  const selD = sel != null ? data[sel] : null;
  return (
    <div>
      <div style={{ height: 22, textAlign: "center", fontFamily: MONO, fontSize: 13, color: C.signalDim, fontWeight: 700 }}>
        {selD ? `${selD.label} ・ ${selD.value}` : `直近${data.length}日 ・ 合計 ${total}`}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: H, padding: "6px 0", borderBottom: `1px solid ${C.line}` }}>
        {data.map((d, i) => {
          const h = Math.round((d.value / max) * (H - 14));
          const on = sel === i;
          return (
            <button key={d.iso} onClick={() => { if (window.Sfx) { window.Sfx.unlock(); window.Sfx.tap(); } setSel(on ? null : i); }}
              aria-label={`${d.label} ${d.value}`}
              style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", alignItems: "flex-end", background: "none", border: "none", padding: 0, cursor: "pointer" }}>
              <span style={{ width: "100%", height: Math.max(2, h), borderRadius: 3, background: on ? C.amber : (d.value ? C.signal : C.line) }} />
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontFamily: MONO, fontSize: 10, color: C.muted }}>
        <span>{data[0] && data[0].label}</span>
        <span>{data[data.length - 1] && data[data.length - 1].label}</span>
      </div>
      <div style={{ fontFamily: SANS, fontSize: 11, color: C.muted, textAlign: "center", marginTop: 8 }}>
        棒をタップすると、その日の値が見られます（1日の最大 {max}）
      </div>
    </div>
  );
}

/* 集計画面（隠しURL #stats）：主要数値の表示＋リロード＋日別グラフ */
function StatsScreen() {
  const [data, setData] = useState(null);
  const [pvDaily, setPvDaily] = useState(null);
  const [ceDaily, setCeDaily] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ok | error | disabled
  const [err, setErr] = useState("");
  const [updated, setUpdated] = useState(null);
  const [detail, setDetail] = useState(null); // タップしたカード（グラフ表示）

  const load = async () => {
    setStatus("loading"); setErr("");
    const SH = typeof window !== "undefined" ? window.SupaHistory : null;
    if (!SH) { setStatus("disabled"); setErr("Supabase未接続"); return; }
    try {
      const ok = await SH.ready();
      if (!ok) { setStatus("disabled"); setErr(SH.lastError || "Supabase未接続"); return; }
      const d = await SH.getStats();
      let pv = null, ce = null;
      try { pv = await SH.getPvDaily(30); } catch (e) { /* 日別関数が未作成でも合計は表示 */ }
      try { ce = await SH.getCheckinsDaily(30); } catch (e) { /* 同上 */ }
      setData(d); setPvDaily(pv); setCeDaily(ce); setUpdated(new Date()); setStatus("ok");
    } catch (e) {
      setErr((e && e.message) || String(e)); setStatus("error");
    }
  };
  useEffect(() => { load(); }, []);

  const num = (v) => (v == null ? "—" : Number(v).toLocaleString("ja-JP"));
  const cards = data ? [
    { key: "pv", k: "総アクセス数 (PV)", v: data.page_views, hint: "アプリを開いた延べ回数", avail: pvDaily != null, series: () => fillDays(pvDaily, "pv", 30) },
    { key: "uniq", k: "ユニーク人数", v: data.unique_users, hint: "PVを出した端末数（目安）", avail: pvDaily != null, series: () => fillDays(pvDaily, "uniques", 30) },
    { key: "pv7", k: "直近7日のPV", v: data.pv_last_7d, hint: "ここ7日間のアクセス", avail: pvDaily != null, series: () => fillDays(pvDaily, "pv", 30) },
    { key: "ck", k: "ココイク総数", v: data.total_checkins, hint: "「行った」記録の合計", avail: ceDaily != null, series: () => fillDays(ceDaily, "checkins", 30) },
    { key: "cku", k: "ココイクした人数", v: data.users_who_checked_in, hint: "記録した端末数", avail: ceDaily != null, series: () => fillDays(ceDaily, "users", 30) },
  ] : [];

  return (
    <Fade key="stats">
      <StepHead n="—" title="統計" sub="このページは隠しURL（#stats）です。数値は合計のみで、個人情報は含みません。" />

      <Btn onClick={load} disabled={status === "loading"}>
        {status === "loading" ? "読み込み中…" : "🔄 最新の数値に更新"}
      </Btn>
      {updated && (
        <p style={{ fontFamily: MONO, fontSize: 12, color: C.muted, textAlign: "center", margin: "10px 0 0" }}>
          最終更新 {updated.toLocaleString("ja-JP")}
        </p>
      )}
      {status === "ok" && (
        <p style={{ fontFamily: SANS, fontSize: 12, color: C.signal, textAlign: "center", margin: "8px 0 0", fontWeight: 700 }}>
          📈 カードをタップすると日別グラフが見られます
        </p>
      )}
      <div style={{ height: 18 }} />

      {status === "ok" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {cards.map((c) => (
            <button key={c.key} onClick={() => { if (window.Sfx) { window.Sfx.unlock(); window.Sfx.tap(); } setDetail(c); }}
              style={{ textAlign: "left", background: C.paperCard, border: `1px solid ${C.line}`, borderRadius: 16, padding: "16px 14px", cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: SANS, fontSize: 12.5, color: C.inkSoft, fontWeight: 700 }}>{c.k}</span>
                <span style={{ fontSize: 13, opacity: 0.7 }}>📈</span>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 34, fontWeight: 800, color: C.ink, margin: "4px 0 2px", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
                {num(c.v)}
              </div>
              <div style={{ fontFamily: SANS, fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{c.hint}</div>
            </button>
          ))}
        </div>
      )}

      {status === "loading" && !data && (
        <div style={{ textAlign: "center", padding: 40, fontFamily: MONO, color: C.muted }}>読み込み中…</div>
      )}

      {(status === "error" || status === "disabled") && (
        <div style={{ background: C.paperCard, border: `1.5px solid ${C.danger}`, borderRadius: 16, padding: 18 }}>
          <div style={{ fontFamily: SANS, fontSize: 15, fontWeight: 800, color: C.danger, marginBottom: 6 }}>
            {status === "disabled" ? "Supabaseに接続できません" : "集計の取得に失敗しました"}
          </div>
          <p style={{ fontFamily: SANS, fontSize: 13, color: C.inkSoft, margin: "0 0 8px", lineHeight: 1.6 }}>
            {String(err).indexOf("get_app_stats") >= 0 || String(err).indexOf("function") >= 0 || String(err).indexOf("does not exist") >= 0
              ? "集計関数 get_app_stats がまだ作成されていない可能性があります。sql/analytics.sql の関数SQLを Supabase の SQL Editor で実行してください。"
              : "しばらくしてからもう一度お試しください。"}
          </p>
          <div style={{ fontFamily: MONO, fontSize: 11, color: C.muted, wordBreak: "break-all" }}>{err}</div>
        </div>
      )}

      {/* カードをタップ → 日別グラフ */}
      {detail && (
        <div style={modalWrap} onClick={() => setDetail(null)}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ fontFamily: SANS, fontSize: 18, fontWeight: 800, color: C.ink }}>{detail.k}</div>
              <button onClick={() => setDetail(null)} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: SANS, fontSize: 15, fontWeight: 700, color: C.muted }}>とじる ✕</button>
            </div>
            <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.inkSoft, marginBottom: 14 }}>{detail.hint}・日別（直近30日）</div>
            {detail.avail ? (
              <MiniBars data={detail.series()} />
            ) : (
              <p style={{ fontFamily: SANS, fontSize: 13, color: C.inkSoft, lineHeight: 1.7 }}>
                グラフ用の関数（get_pv_daily / get_checkins_daily）がまだ作成されていない可能性があります。sql/analytics.sql の日別関数SQLを Supabase の SQL Editor で実行してください。
              </p>
            )}
            <div style={{ height: 16 }} />
            <Btn onClick={() => setDetail(null)}>とじる</Btn>
          </div>
        </div>
      )}
    </Fade>
  );
}

/* ============================================================
   メイン
   ============================================================ */
function App() {
  const [stations, setStations] = useState(DEFAULT_STATIONS);
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState("title"); // title home step1 step2 step3 draw final result manage
  const [hf, setHf] = useState({ ...DEFAULT_HF, timeRanges: {} });
  const [fromShare, setFromShare] = useState(false); // 共有リンクで開いた結果を閲覧中か（他人の条件を見せない対策）
  const [omakase, setOmakase] = useState(false); // 「おまかせで決める」＝全駅・出発駅/距離を無視
  const [refine, setRefine] = useState({});   // 候補画面での「気分でしぼりこむ」
  const [refineOpen, setRefineOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [howToOpen, setHowToOpen] = useState(false); // 使い方モーダル
  const [moodOpen, setMoodOpen] = useState(false); // STEP1「その他の絶対条件」の折りたたみ
  const [bases, setBases] = useState([BASE_DEFAULT]); // 出発駅（複数可）
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

  // 初期ロード（駅データ）。出発駅の復元は「条件を選んで決める」時のみ行う（ホームは条件ゼロ）。
  useEffect(() => {
    (async () => {
      const saved = await loadStations();
      if (saved && Array.isArray(saved) && saved.length) setStations(saved);
      try { /* 出発駅はここでは復元しない（条件ゼロを保つ） */ } catch (e) { /* noop */ }
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

  // STEP1：大きな候補ボードが画面外に出たら、上部に小さな件数バッジを固定表示
  const boardRef = useRef(null);
  const [boardVisible, setBoardVisible] = useState(true);
  useEffect(() => {
    setBoardVisible(true);
    if (screen !== "step1" || typeof IntersectionObserver === "undefined") return;
    const el = boardRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setBoardVisible(e.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [screen]);

  // 共有リンク(#r=駅&b=出発駅&m=ミッション)で開かれたら、同じ結果画面を復元する
  const sharedApplied = useRef(false);
  useEffect(() => {
    if (!ready || sharedApplied.current) return;
    try {
      const h = (typeof location !== "undefined" && location.hash) || "";
      // 隠しURL：#stats → 集計画面
      if (h.replace(/^#/, "").split(/[?&]/)[0] === STATS_HASH) {
        setScreen("stats");
        sharedApplied.current = true;
        return;
      }
      const rm = h.match(/[#&]r=([^&]+)/);
      if (rm) {
        const st = stations.find((s) => s.id === decodeURIComponent(rm[1]));
        if (st) {
          const bm = h.match(/[#&]b=([^&]+)/);
          if (bm) { // 表示用のみ（Cookieには保存しない）。複数出発駅は "." 区切り
            const arr = decodeURIComponent(bm[1]).split(".").map((x) => x.trim()).filter(Boolean);
            if (arr.length) setBases(arr);
          }
          const mm = h.match(/[#&]m=([^&]+)/);
          if (mm) {
            const idxs = decodeURIComponent(mm[1]).split(",").map(Number).filter((i) => !isNaN(i) && MISSIONS[i]);
            if (idxs.length) { setMissionList(idxs.map((i) => MISSIONS[i])); setMissionN(idxs.length); }
          }
          setChosen(st);
          setLastChosen(st);
          setFromShare(true); // 他人の共有結果 → 条件編集画面には入れない（条件を見せない）
          setScreen("final");
        }
      }
    } catch (e) { /* 不正なリンクは無視して通常起動 */ }
    sharedApplied.current = true;
  }, [ready, stations]);

  // 保存
  const persist = (next) => { setStations(next); saveStations(next); };
  const saveBases = (arr) => {
    const clean = arr.filter(Boolean);
    setCookie(BASE_COOKIE, clean.join(","), 365); // 出発駅を Cookie に保存（1年）
    try { if (typeof window !== "undefined" && window.storage) window.storage.set("wheretogo:base:v1", clean.join(",")); } catch (e) { /* noop */ }
  };
  const setBasesAndSave = (arr) => { const a = arr.length ? arr : [BASE_DEFAULT]; setBases(a); saveBases(a); };
  const setBaseAt = (i, id) => { const a = [...bases]; a[i] = id; setBasesAndSave(a); };
  const addBase = () => setBasesAndSave([...bases, ""]);           // 空 = 駅未選択（ピッカーが開く）
  const removeBase = (i) => setBasesAndSave(bases.filter((_, j) => j !== i));

  // 各出発駅からの所要時間マップ（出発駅が変わった時だけ再計算）
  const timeMaps = useMemo(() => bases.map((b) => (b ? shortestTimes(b) : {})), [bases]);
  const baseNames = useMemo(() => bases.map((b) => { const s = stations.find((x) => x.id === b); return s ? s.name : ""; }), [stations, bases]);
  // 候補駅への「各出発駅からの所要時間」リスト
  const stTimes = (st) => bases.map((b, i) => ({ id: b, name: baseNames[i] || "出発駅", t: b && timeMaps[i] ? timeMaps[i][st.id] : null }));
  // 全出発駅のうち最長の所要時間（誰か1人でも経路不明なら null）
  const maxTime = (st) => {
    let m = 0;
    for (let i = 0; i < bases.length; i++) {
      if (!bases[i]) continue;
      const t = timeMaps[i][st.id];
      if (t == null) return null;
      if (t > m) m = t;
    }
    return m;
  };
  // カード等に出す短い所要時間表記（複数出発駅なら「最大約○分」）
  const timeSummary = (st) => {
    const m = maxTime(st);
    if (m == null) return "経路なし";
    return bases.filter(Boolean).length > 1 ? `最大約${m}分` : `約${m}分`;
  };

  // 各出発駅ごとの許容時間範囲（timePerBase=false なら全駅とも共通の [timeMin,timeMax]）
  const timeFilters = useMemo(() => (
    bases.map((b, i) => {
      if (!b) return null;
      const r = hf.timePerBase ? (hf.timeRanges[b] || { min: hf.timeMin, max: hf.timeMax }) : { min: hf.timeMin, max: hf.timeMax };
      return { map: timeMaps[i] || {}, min: r.min, max: r.max };
    }).filter(Boolean)
  ), [bases, timeMaps, hf]);

  const candidates = useMemo(() => {
    const filtered = applyHard(stations, hf, timeFilters, hardWishes);
    // 同名駅（路線違い）は、一番早く着ける1件だけを候補に残す
    return dedupeByName(filtered, (st) => { const m = maxTime(st); return m == null ? Infinity : m; });
  }, [stations, hf, timeFilters, hardWishes]);
  const count = candidates.length;
  const hardWishKeyCount = Object.keys(hardWishes).length;

  // 候補画面での「気分でしぼりこむ」。いま出ている母集団をさらに絞って引き直す。
  // STEP1の条件はいじらないので、戻れば元の候補に戻る。
  const basePool = omakase ? allStations : candidates;
  const refineKeys = Object.keys(refine);
  const refinedPool = useMemo(() => {
    if (!refineKeys.length) return basePool;
    return basePool.filter((s) => refineKeys.every((k) => (s.scores[k] || 0) >= 4));
  }, [basePool, refine]);
  // 各気分を足したら何件になるかを先に出しておく（0件のチップは押せなくする）
  const refineCounts = useMemo(() => {
    const m = {};
    Object.keys(WISH_LABEL).forEach((k) => {
      const ks = refine[k] ? refineKeys.filter((x) => x !== k) : refineKeys.concat(k);
      m[k] = ks.length ? basePool.filter((s) => ks.every((x) => (s.scores[x] || 0) >= 4)).length : basePool.length;
    });
    return m;
  }, [basePool, refine]);
  const drawFrom = (pool) => {
    setShown(sampleBy(pool, 10, (s) => historyWeight(s, hf) * iconicWeight(s, hf)));
    setExcluded([]); setChosen(null);
  };
  const toggleRefine = (k) => {
    const next = { ...refine };
    if (next[k]) delete next[k]; else next[k] = "on";
    setRefine(next);
    const ks = Object.keys(next);
    drawFrom(ks.length ? basePool.filter((s) => ks.every((x) => (s.scores[x] || 0) >= 4)) : basePool);
  };

  // 候補が少ない/0件のとき、「どの条件をどうゆるめると何件になるか」を計算して提案する。
  // 実際に効く順に並べ、押すとその条件に切り替わる。
  const relaxSuggestions = useMemo(() => {
    if (count >= 10) return [];
    const countWith = (nextHf, nextWishes) => {
      const tfs = bases.map((b, i) => {
        if (!b) return null;
        const r = nextHf.timePerBase
          ? (nextHf.timeRanges[b] || { min: nextHf.timeMin, max: nextHf.timeMax })
          : { min: nextHf.timeMin, max: nextHf.timeMax };
        return { map: timeMaps[i] || {}, min: r.min, max: r.max };
      }).filter(Boolean);
      const list = applyHard(stations, nextHf, tfs, nextWishes);
      return dedupeByName(list, () => 0).length;
    };
    const out = [];

    // ① 所要時間を広げる
    if (hf.timeOn && hf.timeMax < 120) {
      const nextMax = hf.timeMax + 30 >= 120 ? 120 : hf.timeMax + 30;
      const label = nextMax >= 120 ? "上限なし" : `${nextMax}分`;
      out.push({
        key: "time",
        label: `所要時間を${label}まで広げる`,
        n: countWith({ ...hf, timeMax: nextMax, timePerBase: false }, hardWishes),
        apply: () => setHf((c) => ({ ...c, timeMax: nextMax, timePerBase: false })),
      });
    }
    // ② 種別を広げる
    if (hf.priority !== "adventure") {
      const next = hf.priority === "standard" ? "hidden" : "adventure";
      const nlabel = next === "hidden" ? "穴場もいれる" : "超冒険";
      out.push({
        key: "prio",
        label: `「${nlabel}」まで候補に入れる`,
        n: countWith({ ...hf, priority: next }, hardWishes),
        apply: () => setHf((c) => ({ ...c, priority: next })),
      });
    }
    // ③ ★最優先をふつうの条件に戻す
    const tops = Object.keys(hardWishes).filter((k) => hardWishes[k] === "top");
    if (tops.length) {
      const soft = { ...hardWishes };
      tops.forEach((k) => { soft[k] = "on"; });
      out.push({
        key: "untop",
        label: "★最優先をふつうの条件に戻す",
        n: countWith(hf, soft),
        apply: () => setHardWishes(soft),
      });
    }
    // ④ 気分を1つ外す（複数選んでいるとき）
    const keys = Object.keys(hardWishes);
    if (keys.length > 1) {
      keys.forEach((k) => {
        const rest = { ...hardWishes };
        delete rest[k];
        out.push({
          key: "drop-" + k,
          label: `「${WISH_LABEL[k] || k}」を条件から外す`,
          n: countWith(hf, rest),
          apply: () => setHardWishes(rest),
        });
      });
    } else if (keys.length === 1) {
      const k = keys[0];
      out.push({
        key: "drop-" + k,
        label: `「${WISH_LABEL[k] || k}」を条件から外す`,
        n: countWith(hf, {}),
        apply: () => setHardWishes({}),
      });
    }
    // ⑤ 時間で絞るのをやめる
    if (hf.timeOn && hf.timeMax < 120) {
      out.push({
        key: "notime",
        label: "所要時間で絞るのをやめる",
        n: countWith({ ...hf, timeOn: false }, hardWishes),
        apply: () => setHf((c) => ({ ...c, timeOn: false })),
      });
    }
    // 実際に増えるものだけ、多い順に最大3件
    return out.filter((o) => o.n > count).sort((a, b) => b.n - a.n).slice(0, 3);
  }, [count, stations, hf, hardWishes, bases, timeMaps]);
  // 全駅（同名は1件に集約）。おまかせ＝出発駅/距離を無視して全駅から。
  const allStations = useMemo(() => dedupeByName(stations, () => 0), [stations]);

  // 所要時間：駅ごとに設定するトグル。ONにしたら各出発駅の範囲を現在の共通範囲で初期化。
  const setTimePerBase = (on) => setHf((cur) => {
    if (!on) return { ...cur, timePerBase: false };
    const tr = { ...cur.timeRanges };
    bases.filter(Boolean).forEach((b) => { if (!tr[b]) tr[b] = { min: cur.timeMin, max: cur.timeMax }; });
    return { ...cur, timePerBase: true, timeRanges: tr };
  });
  const setBaseRange = (baseId, lo, hi) => setHf((cur) => ({ ...cur, timeRanges: { ...cur.timeRanges, [baseId]: { min: lo, max: hi } } }));

  // 条件を丸ごとリセット（デフォルト値へ）。出発駅も既定に戻す（Cookieは消さない）。
  const resetConditions = () => {
    setHf({ ...DEFAULT_HF, timeRanges: {} });
    setHardWishes({}); setSoftWishes([]); setBases([BASE_DEFAULT]);
    setShown([]); setExcluded([]); setChosen(null); setRerollUsed(false);
    setMissionList(null); setMissionN(1);
    setLastRecordedId(null); setFromShare(false); setOmakase(false); setRefine({}); setRefineOpen(false);
  };
  const clearHash = () => { try { if (typeof history !== "undefined" && history.replaceState && location.hash) history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* noop */ } };

  // ホームへ戻る＝毎回条件をリセット（他人の共有条件も引き継がない）
  const goHome = () => {
    setMenuOpen(false); setSettingsOpen(false);
    clearHash(); resetConditions();
    setScreen("home");
  };
  const navTo = (s) => {
    setMenuOpen(false); setSettingsOpen(false);
    if (s === "home") { goHome(); return; }
    setScreen(s);
  };

  // Cookie から出発駅を復元して配列で返す（無ければ既定）
  const basesFromCookie = () => {
    const c = getCookie(BASE_COOKIE);
    const arr = c ? c.split(",").map((x) => x.trim()).filter(Boolean) : [];
    return arr.length ? arr : [BASE_DEFAULT];
  };
  // ホームの「条件を選んで決める」：Cookieの出発駅を復元してSTEP1へ（条件はデフォルト値）
  const startConditions = () => { setOmakase(false); setBases(basesFromCookie()); setScreen("step1"); };
  // 各画面の「条件を変えて選び直す」：いまの条件を保ったままSTEP1へ（おまかせ由来なら出発駅を復元）
  const backToConditions = () => { if (omakase) setBases(basesFromCookie()); setOmakase(false); setScreen("step1"); };
  // 共有結果を見ている人が「自分でも試す」：自分の条件（デフォルト＋自分のCookie出発駅）でSTEP1へ
  const startOwnConditions = () => { resetConditions(); setBases(basesFromCookie()); clearHash(); setScreen("step1"); };

  // ミッション（結果画面）：共有・復元のため App が保持
  const [missionN, setMissionN] = useState(1);
  const [missionList, setMissionList] = useState(null);

  // 共有：Web Share API →（非対応なら）クリップボードにコピー
  const [shareToast, setShareToast] = useState("");
  const shareToastTimer = useRef(null);
  const showShareToast = (msg) => {
    setShareToast(msg);
    if (shareToastTimer.current) clearTimeout(shareToastTimer.current);
    shareToastTimer.current = setTimeout(() => setShareToast(""), 2800);
  };
  const appUrl = () => (typeof location !== "undefined" ? location.origin + location.pathname : "");
  const shareWith = async (text, url) => {
    const data = { title: "ドコイク？", text, url };
    try {
      if (typeof navigator !== "undefined" && navigator.share) { await navigator.share(data); return; }
    } catch (e) { if (e && e.name === "AbortError") return; /* それ以外はコピーへ */ }
    try {
      await navigator.clipboard.writeText((text ? text + "\n" : "") + url);
      showShareToast("📋 リンクをコピーしました。友だちに送れます！");
    } catch (e) {
      showShareToast("コピーできませんでした。URL: " + url);
    }
  };
  // アプリの共有（トップページ）
  const doShare = () => shareWith("迷ったらこれ。今日のおでかけ先をおまかせで提案してくれるアプリ「ドコイク？」", appUrl());
  // 結果の共有：駅・出発駅・ミッションを URL(#) に埋め込み、開くと同じ結果画面を復元
  const shareResult = () => {
    if (!chosen) return;
    const idxs = (missionList || []).map((m) => MISSIONS.indexOf(m)).filter((i) => i >= 0);
    const parts = ["r=" + encodeURIComponent(chosen.id), "b=" + encodeURIComponent(bases.filter(Boolean).join("."))];
    if (idxs.length) parts.push("m=" + idxs.join(","));
    const link = appUrl() + "#" + parts.join("&");
    let text = `ドコイク？のおまかせで、今日は『${chosen.name}』に行くことに決まった！`;
    if (missionList && missionList.length) {
      text += "\n\n🎯 今日のミッション\n" + missionList.map((m) => "・" + m.t).join("\n");
    }
    text += "\n\nあなたも行き先に迷ったら👇";
    shareWith(text, link);
  };

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
    setOmakase(false); setRefine({}); setRefineOpen(false);
    setShown(sampleBy(candidates, 10, (s) => historyWeight(s, hf) * iconicWeight(s, hf)));
    setExcluded([]); setChosen(null); setScreen("pick10");
  };
  // おまかせ：出発駅・距離・条件を無視して、全駅からランダムに10件
  const searchOmakase = () => {
    setOmakase(true); setRefine({}); setRefineOpen(false);
    setShown(sample(allStations, 10));
    setExcluded([]); setChosen(null); setScreen("pick10");
  };

  // 今日の気分（任意条件フェーズ）画面へ
  const goWishes = () => setScreen("step3");

  const reroll = () => {
    if (rerollUsed) return;
    setShown(sampleBy(candidates, 10, (s) => historyWeight(s, hf) * iconicWeight(s, hf)));
    setExcluded([]); setChosen(null); setRerollUsed(true); setScreen("pick10");
  };

  // 10件（「ここは嫌だ」除外後）から1件。気分未選択なら完全ランダム、選択なら気分スコアの積で重み付け。
  const runReveal = (pool) => {
    if (!pool.length) return;
    const target = pickBy(pool, (s) => softWeight(s, softWishes));
    setMissionList(null); setMissionN(1); // 新しい結果ではミッションをリセット
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
            <ShareIconBtn onClick={doShare} />
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
        <Breadcrumb screen={screen} onNav={navTo} fromShare={fromShare} />
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
              icon="📖" title="使い方"
              desc="このアプリの使い方をおさらいします。"
              onClick={() => { setMenuOpen(false); setHowToOpen(true); }}
            />
            <div style={{ height: 10 }} />
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

      {/* 使い方モーダル */}
      {howToOpen && (
        <div style={modalWrap} onClick={() => setHowToOpen(false)}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontFamily: SANS, fontSize: 19, fontWeight: 800, color: C.ink }}>使い方</div>
              <button onClick={() => setHowToOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: SANS, fontSize: 15, fontWeight: 700, color: C.muted }}>とじる ✕</button>
            </div>
            <p style={{ fontFamily: SANS, fontSize: 14, color: C.inkSoft, margin: "0 0 14px", lineHeight: 1.7 }}>
              <b>ドコイク？</b>は、行き先に迷ったときに<b>今日のおでかけ先を1つ選んでくれる</b>アプリです。
            </p>
            <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
              {[
                ["1", "条件を選ぶ", "出発駅・所要時間・気分などを選びます。何も選ばず「おまかせ」でもOK。"],
                ["2", "候補から外す", "条件に合う候補が出ます。行きたくない所は「ここは嫌だ」で外せます。"],
                ["3", "1つに決める", "「ここから一つ決める」→ ルーレットが回って、今日の行き先が決定！"],
              ].map(([no, t, sub]) => (
                <div key={no} style={{ display: "flex", gap: 10, alignItems: "flex-start", background: C.paperCard, border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 14px" }}>
                  <span style={{ flex: "0 0 auto", width: 24, height: 24, borderRadius: "50%", background: C.signal, color: "#fff", fontFamily: MONO, fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>{no}</span>
                  <span style={{ flex: 1 }}>
                    <span style={{ display: "block", fontFamily: SANS, fontSize: 15, fontWeight: 800, color: C.ink }}>{t}</span>
                    <span style={{ display: "block", fontFamily: SANS, fontSize: 12.5, color: C.inkSoft, marginTop: 2, lineHeight: 1.55 }}>{sub}</span>
                  </span>
                </div>
              ))}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, color: C.signal, fontWeight: 700, marginBottom: 8 }}>ことばの意味</div>
            <div style={{ display: "grid", gap: 8 }}>
              {[
                ["ココイク", "行き先が決まったあと、「ここに行く！」と決定＆記録するボタン。"],
                ["ココイッタ", "実際に行った場所の記録。行った回数を貯めて振り返れます。"],
                ["ミッション", "おでかけがちょっと楽しくなるお題。結果画面でランダムに出せます。"],
              ].map(([k, v]) => (
                <div key={k} style={{ fontFamily: SANS, fontSize: 13, color: C.inkSoft, lineHeight: 1.6 }}>
                  <b style={{ color: C.ink }}>{k}</b> … {v}
                </div>
              ))}
            </div>
            <div style={{ height: 16 }} />
            <Btn onClick={() => setHowToOpen(false)}>とじる</Btn>
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
            <p style={{ fontFamily: SANS, fontSize: 15, color: C.inkSoft, lineHeight: 1.9, maxWidth: 330, margin: 0 }}>
              「今日どこ行く？」を、<b style={{ color: C.signal }}>アプリが代わりに決めてくれる</b>。<br />
              東京・神奈川・埼玉・千葉の1515駅から、<br />
              今日のおでかけ先をおまかせでご提案します。
            </p>
            <div style={{ height: 24 }} />
            <div style={{ width: "100%", maxWidth: 340, background: C.paperCard, border: `1px solid ${C.line}`, borderRadius: 16, padding: "16px 16px 8px", textAlign: "left" }}>
              <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, color: C.signal, fontWeight: 700, marginBottom: 12, textAlign: "center" }}>
                つかいかた（3ステップ）
              </div>
              {[
                ["1", "出発駅や気分など、条件を選ぶ", "ぜんぶ「おまかせ」でもOK"],
                ["2", "出てきた候補から、行きたくない所を外す", null],
                ["3", "ルーレットで、今日の行き先が1つに決定！", null],
              ].map(([no, t, sub]) => (
                <div key={no} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 12 }}>
                  <span style={{ flex: "0 0 auto", width: 24, height: 24, borderRadius: "50%", background: C.signal, color: "#fff", fontFamily: MONO, fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>{no}</span>
                  <span style={{ flex: 1 }}>
                    <span style={{ display: "block", fontFamily: SANS, fontSize: 14.5, fontWeight: 700, color: C.ink, lineHeight: 1.45 }}>{t}</span>
                    {sub && <span style={{ display: "block", fontFamily: SANS, fontSize: 12, color: C.muted, marginTop: 1 }}>{sub}</span>}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ height: 22 }} />
            <div style={{ width: "100%", maxWidth: 340 }}>
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
            考えるのは最低限。行き先はアプリにおまかせ。
          </p>
          <Board count={allStations.length} />
          <p style={{ fontFamily: SANS, fontSize: 12.5, color: C.muted, textAlign: "center", margin: "8px 0 0", lineHeight: 1.6 }}>
            東京・神奈川・埼玉・千葉の全駅。ここから今日の1つを決めます。
          </p>
          <div style={{ height: 20 }} />
          <Btn onClick={startConditions}>条件を選んで決める →</Btn>
          <p style={{ fontFamily: SANS, fontSize: 12, color: C.muted, textAlign: "center", margin: "6px 0 0" }}>
            エリア・時間・気分などで絞ってから決める
          </p>
          <div style={{ height: 14 }} />
          <Btn kind="ghost" onClick={searchOmakase}>おまかせですぐ決める →</Btn>
          <p style={{ fontFamily: SANS, fontSize: 12, color: C.muted, textAlign: "center", margin: "6px 0 0" }}>
            条件なし・全駅からランダムに候補を出す
          </p>
          <div style={{ height: 22 }} />
          <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 18 }}>
            <Btn kind="ghost" onClick={() => setScreen("manage")}>📍 ココイッタ登録 →</Btn>
            <p style={{ fontFamily: SANS, fontSize: 12, color: C.muted, textAlign: "center", margin: "6px 0 0" }}>
              行った場所を記録・確認する
            </p>
          </div>
        </Fade>
      )}

      {screen === "step1" && (
        <Fade key="step1">
          <StepHead n="01" title="ゆずれない条件" sub="ここで選ぶと、合わない場所は最初から候補に出なくなります。ぜんぶ選ばずに進んでもOK。" />
          <div ref={boardRef}>
            <Board count={count} note={count === 0 ? "しぼりすぎかも" : count <= 6 ? "だいぶ絞れてきました" : null} />
          </div>
          <div style={{ height: 22 }} />

          <FieldLabel eyebrow="FROM" title="どこから出かける？" />
          <div style={{ display: "grid", gap: 8 }}>
            {bases.map((bid, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <BasePicker stations={stations} baseId={bid} onPick={(id) => setBaseAt(i, id)} index={bases.length > 1 ? i + 1 : null} />
                </div>
                {bases.length > 1 && (
                  <button onClick={() => { if (window.Sfx) { window.Sfx.unlock(); window.Sfx.minus(); } removeBase(i); }}
                    aria-label="この出発駅を削除"
                    style={{ flex: "0 0 auto", width: 44, borderRadius: 12, border: `1.5px solid ${C.line}`, background: C.paperCard, color: C.danger, fontFamily: SANS, fontSize: 18, fontWeight: 800, cursor: "pointer" }}>✕</button>
                )}
              </div>
            ))}
          </div>
          <button onClick={() => { if (window.Sfx) { window.Sfx.unlock(); window.Sfx.plus(); } addBase(); }}
            style={{ marginTop: 8, background: "none", border: `1.5px dashed ${C.signal}`, color: C.signal, borderRadius: 12, padding: "10px 14px", fontFamily: SANS, fontSize: 14, fontWeight: 700, cursor: "pointer", width: "100%" }}>
            ＋ 出発駅を追加
          </button>
          {bases.filter(Boolean).length > 1 && (
            <p style={{ fontFamily: SANS, fontSize: 11.5, color: C.muted, margin: "8px 0 0", lineHeight: 1.6 }}>
              複数のときは、<b>すべての出発駅から時間内に行ける場所</b>だけを候補にします（所要時間は各駅ぶん表示します）。
            </p>
          )}
          <div style={{ height: 18 }} />

          <FieldLabel eyebrow="TIME" title={bases.filter(Boolean).length > 1 ? "各出発駅からの所要時間" : `${baseNames[0] || "出発駅"}からの所要時間`} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 9, marginBottom: hf.timeOn ? 6 : 18 }}>
            <Chip active={!hf.timeOn} onClick={() => setHf({ ...hf, timeOn: false })}>おまかせ</Chip>
            <Chip active={hf.timeOn} onClick={() => setHf({ ...hf, timeOn: true })}>時間で絞る</Chip>
          </div>
          {hf.timeOn && (
            <div style={{ marginBottom: 18 }}>
              {bases.filter(Boolean).length > 1 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 9, marginBottom: 12 }}>
                  <Chip active={!hf.timePerBase} onClick={() => setTimePerBase(false)}>全駅まとめて</Chip>
                  <Chip active={hf.timePerBase} onClick={() => setTimePerBase(true)}>駅ごとに設定</Chip>
                </div>
              )}

              {(!hf.timePerBase || bases.filter(Boolean).length <= 1) ? (
                <>
                  <div style={{ fontFamily: MONO, fontSize: 15, color: C.signal, fontWeight: 800, textAlign: "center", marginBottom: 2 }}>
                    {hf.timeMin}分 〜 {hf.timeMax >= 120 ? "上限なし" : `${hf.timeMax}分`}
                  </div>
                  <RangeSlider
                    valueMin={hf.timeMin}
                    valueMax={hf.timeMax}
                    onChange={(lo, hi) => setHf({ ...hf, timeMin: lo, timeMax: hi })}
                  />
                </>
              ) : (
                <div style={{ display: "grid", gap: 16 }}>
                  {bases.map((b, i) => {
                    if (!b) return null;
                    const r = hf.timeRanges[b] || { min: hf.timeMin, max: hf.timeMax };
                    return (
                      <div key={b + "-" + i}>
                        <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: C.ink }}>{baseNames[i] || "出発駅"}</div>
                        <div style={{ fontFamily: MONO, fontSize: 14, color: C.signal, fontWeight: 800, textAlign: "center", marginBottom: 2 }}>
                          {r.min}分 〜 {r.max >= 120 ? "上限なし" : `${r.max}分`}
                        </div>
                        <RangeSlider valueMin={r.min} valueMax={r.max} onChange={(lo, hi) => setBaseRange(b, lo, hi)} />
                      </div>
                    );
                  })}
                </div>
              )}
              <p style={{ fontFamily: SANS, fontSize: 11.5, color: C.muted, textAlign: "center", margin: "0" }}>
                ※所要時間は概算です（経路が分からない駅は対象外）
              </p>
            </div>
          )}

          <FieldLabel eyebrow="RANGE" title="どんな所まで候補に入れる？" />
          <Row>
            <Chip active={hf.priority === "standard"} onClick={() => setHf({ ...hf, priority: "standard" })}>定番だけ</Chip>
            <Chip active={hf.priority === "hidden"} onClick={() => setHf({ ...hf, priority: "hidden" })}>穴場もいれる</Chip>
            <Chip active={hf.priority === "adventure"} onClick={() => setHf({ ...hf, priority: "adventure" })}>超冒険</Chip>
          </Row>
          <p style={{ fontFamily: SANS, fontSize: 11.5, color: C.muted, margin: "-8px 0 18px", lineHeight: 1.6 }}>
            定番＝有名でハズさない所／穴場＝ちょっとマイナー／超冒険＝かなりマニアックな所まで
          </p>

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

          {/* 候補が少ない/0件のとき、実際に効く緩和策を提案する */}
          {relaxSuggestions.length > 0 && (
            <div className="fade" style={{
              marginTop: 14, background: count === 0 ? "rgba(192,85,62,.06)" : C.paperCard,
              border: `1.5px solid ${count === 0 ? C.danger : C.line}`, borderRadius: 16, padding: "14px 15px",
            }}>
              <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 800, color: count === 0 ? C.danger : C.ink, marginBottom: 4 }}>
                {count === 0 ? "条件に合う場所がありません" : `候補が${count}件しかありません`}
              </div>
              <p style={{ fontFamily: SANS, fontSize: 12.5, color: C.inkSoft, margin: "0 0 12px", lineHeight: 1.6 }}>
                下をタップすると、その条件にゆるめられます。
              </p>
              <div style={{ display: "grid", gap: 8 }}>
                {relaxSuggestions.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => { if (window.Sfx) { window.Sfx.unlock(); window.Sfx.tap(); } s.apply(); }}
                    style={{
                      width: "100%", textAlign: "left", background: "#fff", border: `1.5px solid ${C.signal}`,
                      borderRadius: 12, padding: "11px 13px", cursor: "pointer", display: "flex",
                      alignItems: "center", justifyContent: "space-between", gap: 10,
                    }}
                  >
                    <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: C.ink, flex: 1 }}>
                      {s.label}
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: C.signal, flex: "0 0 auto" }}>
                      {s.n}件 →
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {count === 0 && relaxSuggestions.length === 0 && (
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
          <StepHead n="02" title="今日の候補" sub="気が乗らない所は「ここは嫌だ」で外せます。「ここから一つ決める」を押すと、ルーレットで1つに決まります。" />
          {shown.length === 0 ? (
            <div style={{ border: `2px dashed ${C.line}`, borderRadius: 16, padding: 20, background: C.paperCard, textAlign: "center" }}>
              <p style={{ fontFamily: SANS, fontSize: 15, color: C.inkSoft, margin: "0 0 14px" }}>
                候補がありません。条件をゆるめてください。
              </p>
              <Btn onClick={() => setScreen("step1")}>条件を見直す</Btn>
            </div>
          ) : (
            <>
              {/* 気分でしぼりこむ：条件を戻さずに、この場で候補を引き直せる */}
              <button
                onClick={() => { if (window.Sfx) { window.Sfx.unlock(); window.Sfx.tap(); } setRefineOpen((v) => !v); }}
                style={{
                  width: "100%", textAlign: "left", background: refineKeys.length ? "rgba(14,140,129,.08)" : C.paperCard,
                  border: `1.5px solid ${refineKeys.length ? C.signal : C.line}`, borderRadius: 12,
                  padding: "11px 14px", cursor: "pointer", display: "flex",
                  justifyContent: "space-between", alignItems: "center", marginBottom: 10,
                }}
              >
                <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: C.ink }}>
                  🔎 気分でしぼりこむ
                  {refineKeys.length > 0 && (
                    <span style={{ color: C.signal }}>（{refineKeys.map((k) => WISH_LABEL[k]).join("・")}）</span>
                  )}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 16, color: C.signal, fontWeight: 700 }}>{refineOpen ? "－" : "＋"}</span>
              </button>
              {refineOpen && (
                <div className="fade" style={{ marginBottom: 12 }}>
                  <p style={{ fontFamily: SANS, fontSize: 12, color: C.inkSoft, margin: "0 0 8px", lineHeight: 1.6 }}>
                    タップすると、その気分に合う駅だけで<b>候補を引き直します</b>。条件はそのままなので、もう一度押せば戻せます。
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                    {Object.keys(WISH_LABEL).map((k) => {
                      const on = !!refine[k];
                      const n = refineCounts[k] || 0;
                      const dead = !on && n === 0;
                      return (
                        <button
                          key={k}
                          disabled={dead}
                          onClick={() => { if (window.Sfx) { window.Sfx.unlock(); window.Sfx.tap(); } toggleRefine(k); }}
                          style={{
                            appearance: "none", borderRadius: 999, padding: "8px 12px",
                            border: `1.5px solid ${on ? C.signal : C.line}`,
                            background: on ? C.signal : C.paperCard,
                            color: on ? "#fff" : (dead ? C.muted : C.ink),
                            fontFamily: SANS, fontSize: 13, fontWeight: on ? 700 : 500,
                            cursor: dead ? "not-allowed" : "pointer", opacity: dead ? 0.4 : 1,
                          }}
                        >
                          {WISH_LABEL[k]}
                          <span style={{ fontFamily: MONO, fontSize: 11, marginLeft: 5, opacity: 0.75 }}>{n}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ fontFamily: MONO, fontSize: 12, color: C.muted, marginBottom: 10 }}>
                のこり {remaining} 件
                {refineKeys.length > 0 && (
                  <span style={{ color: C.signal, fontWeight: 700 }}>　/　しぼりこみ後 {refinedPool.length} 件から抽選</span>
                )}
              </div>
              <div style={{ display: "grid", gap: 12 }}>
                {shown.map((st, i) => (
                  <div key={st.id} className="deal" style={{ animationDelay: `${i * 45}ms` }}>
                    <StationCard
                      st={st} index={i}
                      timeText={(!omakase && hf.timeOn) ? timeSummary(st) : null}
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
              <div style={{ height: 10 }} />
              <Btn kind="ghost" onClick={backToConditions}>🔧 条件を変えて選び直す</Btn>
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
          <div style={{ height: 10 }} />
          <Btn kind="ghost" onClick={backToConditions}>🔧 条件を変えて選び直す</Btn>
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
            <Ticket st={chosen} timeText={(!omakase && maxTime(chosen) != null) ? timeSummary(chosen) : null} wishes={fromShare ? {} : shownWishes} />
          </div>
          {!omakase && bases.filter(Boolean).length > 1 && (
            <div style={{ background: C.paperCard, border: `1px solid ${C.line}`, borderRadius: 14, padding: "12px 14px", marginTop: 12 }}>
              <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, color: C.signal, fontWeight: 700, marginBottom: 6 }}>各出発駅からの所要時間</div>
              <div style={{ display: "grid", gap: 6 }}>
                {stTimes(chosen).map((r, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: 14 }}>
                    <span style={{ color: C.ink, fontWeight: 700 }}>{r.name}</span>
                    <span style={{ fontFamily: MONO, color: r.t == null ? C.muted : C.signalDim, fontWeight: 700 }}>{r.t == null ? "経路なし" : `約${r.t}分`}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
          <div style={{ height: 12 }} />
          <Btn kind="dark" onClick={shareResult}>
            📤 この結果{missionList && missionList.length ? "＋ミッション" : ""}を友だちにシェア
          </Btn>
          <p style={{ fontFamily: SANS, fontSize: 11.5, color: C.muted, textAlign: "center", margin: "8px 6px 0", lineHeight: 1.6 }}>
            リンクを開くと、同じ駅{missionList && missionList.length ? "とミッション" : ""}の結果画面が表示されます。
          </p>
          <div style={{ height: 22 }} />
          <MissionBox n={missionN} onN={setMissionN} list={missionList} onGenerate={setMissionList} />
          <div style={{ height: 16 }} />
          {fromShare ? (
            <Btn kind="ghost" onClick={startOwnConditions}>🔧 自分でも条件を選んで決める →</Btn>
          ) : (
            <Btn kind="ghost" onClick={backToConditions}>🔧 条件を変えて選び直す</Btn>
          )}
          <div style={{ height: 10 }} />
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

      {screen === "stats" && <StatsScreen />}

      {/* STEP1でボードが見えなくなったら、上部に小さな件数バッジを固定表示 */}
      {screen === "step1" && !boardVisible && (
        <div style={{
          position: "fixed", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 45,
          background: C.ink, color: "#fff", borderRadius: 999, padding: "8px 18px",
          display: "flex", alignItems: "baseline", gap: 7, boxShadow: "0 6px 20px -6px rgba(23,38,58,.6)",
        }}>
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 2, color: C.signalBright, fontWeight: 700 }}>候補</span>
          <span style={{ fontFamily: MONO, fontSize: 20, fontWeight: 800, color: count === 0 ? C.amber : "#fff", fontVariantNumeric: "tabular-nums" }}>{count}</span>
          <span style={{ fontFamily: SANS, fontSize: 12, color: "#B9C3CE", fontWeight: 600 }}>件</span>
        </div>
      )}

      {/* 共有時のフィードバック（コピー時など） */}
      {shareToast && (
        <div style={{
          position: "fixed", left: "50%", bottom: 28, transform: "translateX(-50%)",
          background: C.ink, color: "#fff", fontFamily: SANS, fontSize: 13.5, fontWeight: 700,
          padding: "12px 18px", borderRadius: 999, zIndex: 90, maxWidth: "90vw", textAlign: "center",
          boxShadow: "0 8px 24px -8px rgba(23,38,58,.6)",
        }}>
          {shareToast}
        </div>
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

/* ココイッタの1行。editable のときだけ ＋1/−1 を表示（増減はアニメで見せる）。
   onEdit を渡すと、行全体をタップで編集（登録＝検索）画面へ遷移できる */
function VisitRow({ st, onAdd, onRemove, recorded, rank, editable, onEdit }) {
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
    <div
      onClick={onEdit ? () => { if (window.Sfx) { window.Sfx.unlock(); window.Sfx.tap(); } onEdit(st); } : undefined}
      style={{ background: C.paperCard, border: `1px solid ${recorded ? C.signal : C.line}`, borderRadius: 14, padding: "12px 14px", cursor: onEdit ? "pointer" : "default" }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        {rank != null && <div style={{ fontFamily: MONO, fontSize: 12, color: C.muted, fontWeight: 700, minWidth: 22 }}>#{rank}</div>}
        <div style={{ fontFamily: SANS, fontSize: 18, fontWeight: 800, color: C.ink }}>{st.name}</div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: C.muted }}>{st.area}</div>
        {onEdit && <div style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 12, color: C.signal, fontWeight: 700 }}>編集 ›</div>}
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

/* シェアアイコン（アプリを共有） */
function ShareIconBtn({ onClick }) {
  return (
    <button
      aria-label="アプリをシェア"
      onClick={() => { if (window.Sfx) { window.Sfx.unlock(); window.Sfx.tap(); } onClick(); }}
      style={{
        width: 40, height: 40, borderRadius: 12, border: `1.5px solid ${C.line}`,
        background: C.paperCard, cursor: "pointer", display: "flex", alignItems: "center",
        justifyContent: "center", padding: 0,
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.signal} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18" cy="5" r="2.6" /><circle cx="6" cy="12" r="2.6" /><circle cx="18" cy="19" r="2.6" />
        <path d="M8.3 10.7 15.7 6.3" /><path d="M8.3 13.3 15.7 17.7" />
      </svg>
    </button>
  );
}

/* 隠しURL：#stats で集計画面を開く（変更したい場合はこの文字列を差し替え） */
const STATS_HASH = "stats";

/* パンくずリスト（途中の項目をタップでその画面へ戻れる） */
const CRUMBS = {
  home: [["ホーム", "home"]],
  step1: [["ホーム", "home"], ["条件", "step1"]],
  pick10: [["ホーム", "home"], ["条件", "step1"], ["候補", "pick10"]],
  step3: [["ホーム", "home"], ["条件", "step1"], ["候補", "pick10"], ["今日の気分", "step3"]],
  reveal: [["ホーム", "home"], ["条件", "step1"], ["候補", "pick10"], ["結果", "final"]],
  final: [["ホーム", "home"], ["条件", "step1"], ["候補", "pick10"], ["結果", "final"]],
  manage: [["ホーム", "home"], ["ココイッタ", "manage"]],
  stats: [["ホーム", "home"], ["統計", "stats"]],
};
function Breadcrumb({ screen, onNav, fromShare }) {
  // 共有結果を見ている人には、共有者の「条件」「候補」を見せない（ホーム › 結果 のみ）
  const items = (fromShare && (screen === "final" || screen === "reveal"))
    ? [["ホーム", "home"], ["結果", "final"]]
    : (CRUMBS[screen] || [["ホーム", "home"]]);
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
function BasePicker({ stations, baseId, onPick, index }) {
  const cur = stations.find((s) => s.id === baseId);
  const [open, setOpen] = useState(!baseId); // 未選択なら最初から検索を開く
  const [q, setQ] = useState("");
  const matches = useMemo(() => {
    const query = q.trim();
    if (!query) return [];
    return stations.filter((s) => s.name.includes(query)).slice(0, 8);
  }, [stations, q]);
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        width: "100%", textAlign: "left", background: C.paperCard, border: `1.5px solid ${cur ? C.line : C.signal}`,
        borderRadius: 12, padding: "12px 14px", cursor: "pointer", fontFamily: SANS,
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: cur ? C.ink : C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {index != null && <span style={{ fontFamily: MONO, fontSize: 12, color: C.signal, marginRight: 6 }}>{index}.</span>}
          {cur ? cur.name : "駅を選ぶ"}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 12, color: C.signal, fontWeight: 700, flex: "0 0 auto" }}>{cur ? "変更" : "選ぶ"}</span>
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

  // 登録・編集モーダルを開く（query を渡すとその駅を検索した状態で開く）
  const openReg = (query = "") => { setRegOpen(true); setRegQ(query); };

  return (
    <Fade key="manage">
      <StepHead n="—" title="ココイッタ（行った場所の記録）" sub="実際に行った場所がたまっていきます。回数が多い順にならび、一覧をタップすると回数を編集できます。" />

      {/* ココイッタ登録ボタン → 駅を検索する状態でモーダルを開く */}
      <Btn kind="primary" onClick={() => openReg("")}>
        ＋ ココイッタを登録
      </Btn>

      {/* 登録モーダル：画面いっぱい。ここでだけ ＋1/−1 ができる */}
      {regOpen && (
        <div style={{ position: "fixed", inset: 0, background: C.paper, zIndex: 60, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 12px", borderBottom: `1px solid ${C.line}` }}>
            <div style={{ fontFamily: SANS, fontSize: 19, fontWeight: 800, color: C.ink }}>ココイッタを登録・編集</div>
            <button onClick={() => setRegOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: SANS, fontSize: 15, fontWeight: 700, color: C.muted }}>とじる ✕</button>
          </div>
          <div style={{ padding: "12px 16px 6px" }}>
            <input autoFocus value={regQ} onChange={(e) => setRegQ(e.target.value)} placeholder="駅名でさがす（例：横浜）" style={inputStyle} />
            <div style={{ fontFamily: MONO, fontSize: 12, color: C.muted, margin: "10px 2px 2px" }}>
              {regQ.trim() ? `「${regQ.trim()}」の検索結果（＋1／−1で回数を調整）` : (regResults.length ? "直前に選ばれた駅（新しい順）" : "駅名で検索するか、まず「ドコイク？」で駅を決めると、ここに出ます")}
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
          <VisitRow key={st.id} st={st} rank={sort === "count" ? i + 1 : null} onEdit={(s) => openReg(s.name)} />
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
      iconic: s.iconic || 1,
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
