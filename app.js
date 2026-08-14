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
   データ（東京・神奈川 955駅 / おでかけ先ネットワーク v1）
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
function applyHard(list, hf, timeMap) {
  const allowed = PRIORITY_SET[hf.priority] || PRIORITY_SET.standard;
  return list.filter((st) => {
    if (!allowed.includes(st.pr)) return false;
    if (hf.time) {
      const t = timeMap[st.id];
      if (t == null || t > hf.time) return false;
    }
    if (hf.history === "unvisited" && st.visited) return false;
    if (hf.history === "excludeRecent" && isRecent(st)) return false;
    return true;
  });
}

// 希望条件（dateScores）: 除外せず抽選確率だけ上げる重み付け
// 選択キーの平均スコア(1..5)を 1.9^(avg-3) に変換（3で等倍、5で約3.6倍、1で約0.28倍）
function weightOf(st, wishes) {
  if (!wishes.length) return 1;
  let sum = 0;
  wishes.forEach((k) => { sum += st.scores[k] || 3; });
  const avg = sum / wishes.length;
  return Math.pow(1.9, avg - 3);
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
  if (!wishes.length) return sample(pool, n);
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
  return wishes
    .map((k) => ({ k, label: label[k], score: st.scores[k] || 3 }))
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => ({ label: x.label, mark: x.score >= 4 ? "◎" : "○" }));
}

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
function WishPicker({ wishes, onToggle }) {
  return (
    <>
      {WISH_GROUPS.map((g) => (
        <div key={g.title}>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, color: C.signal, fontWeight: 700, margin: "12px 0 8px" }}>
            {g.title}
          </div>
          <Row>
            {g.items.map(([k, label]) => (
              <Chip key={k} active={wishes.includes(k)} onClick={() => onToggle(k)}>{label}</Chip>
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
      elapsed += delay;
      if (elapsed > 3600) delay += 26;             // 十分回してから減速
      if (delay > 240 || elapsed > 5200) {          // 着地
        setDisplay(targetName); setLocked(true);
        timer = setTimeout(() => alive && onDone(), 1000);
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
      onClick={onClick} disabled={disabled}
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

/* ============================================================
   メイン
   ============================================================ */
function App() {
  const [stations, setStations] = useState(DEFAULT_STATIONS);
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState("title"); // title home step1 step2 step3 draw final result manage
  const [hf, setHf] = useState({ priority: "standard", time: null, history: null });
  const [base, setBase] = useState(BASE_DEFAULT);
  const [wishes, setWishes] = useState([]);
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

  const candidates = useMemo(() => applyHard(stations, hf, timeMap), [stations, hf, timeMap]);
  const count = candidates.length;

  const resetFlow = () => {
    setHf({ priority: "standard", time: null, history: null });
    setWishes([]); setShown([]); setExcluded([]); setChosen(null); setRerollUsed(false);
    setLastRecordedId(null);
    setScreen("home");
  };

  const toggleWish = (k) => setWishes((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  const toggleExclude = (st) => setExcluded((cur) => (cur.includes(st.id) ? cur.filter((x) => x !== st.id) : [...cur, st.id]));

  // ① 絶対条件で候補を出す → ② 今日の気分を反映して10件を表示
  const search10 = () => {
    setShown(sampleWeighted(candidates, wishes, 10));
    setExcluded([]); setChosen(null); setScreen("pick10");
  };

  // 希望条件（気分）画面へ
  const goWishes = () => setScreen("step3");

  const reroll = () => {
    if (rerollUsed) return;
    setShown(sampleWeighted(candidates, wishes, 10));
    setExcluded([]); setChosen(null); setRerollUsed(true); setScreen("pick10");
  };

  // 1件を選び、抽選演出へ（希望条件があれば重み付き）
  const runReveal = (pool) => {
    if (!pool.length) return;
    const target = pickWeighted(pool, wishes);
    setChosen(target);
    setLastChosen(target);
    setChosenHistory((h) => [target, ...h.filter((x) => x.id !== target.id)].slice(0, 30));
    setRevealNames(pool.map((p) => p.name));
    setRevealTarget(target.name);
    setScreen("reveal");
  };
  // ④-1 いま出ている10件から「ここは嫌だ」以外の1件（この時点では希望なし＝均等）
  const decideFromTen = () => runReveal(shown.filter((s) => !excluded.includes(s.id)));
  // ⑤-2 「ここは嫌だ」を除いた全候補から、希望条件の重み付きで1件
  const decideWithWishes = () => runReveal(candidates.filter((s) => !excluded.includes(s.id)));

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

      {/* ヘッダ */}
      {screen !== "title" && (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <button onClick={resetFlow} style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0, display: "flex", alignItems: "center" }}>
          <Logo size={28} />
        </button>
        {screen !== "manage" ? (
          <button onClick={() => setScreen("manage")} style={miniLink}>ココイッタ</button>
        ) : (
          <button onClick={resetFlow} style={miniLink}>戻る</button>
        )}
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
              東京・神奈川の955駅から、<br />
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

          <FieldLabel eyebrow="TIME" title={`${baseName}からどれくらい？`} />
          <Row>
            <Chip active={hf.time === null} onClick={() => setHf({ ...hf, time: null })}>おまかせ</Chip>
            {[30, 60, 90].map((t) => (
              <Chip key={t} active={hf.time === t} onClick={() => setHf({ ...hf, time: t })}>{t}分以内</Chip>
            ))}
          </Row>

          <FieldLabel eyebrow="RANGE" title="どこまで攻める？" />
          <Row>
            <Chip active={hf.priority === "standard"} onClick={() => setHf({ ...hf, priority: "standard" })}>定番だけ</Chip>
            <Chip active={hf.priority === "hidden"} onClick={() => setHf({ ...hf, priority: "hidden" })}>穴場もいれる</Chip>
            <Chip active={hf.priority === "adventure"} onClick={() => setHf({ ...hf, priority: "adventure" })}>超冒険</Chip>
          </Row>

          <FieldLabel eyebrow="HISTORY" title="前に行った場所は？" />
          <Row>
            <Chip active={hf.history === null} onClick={() => setHf({ ...hf, history: null })}>おまかせ</Chip>
            <Chip active={hf.history === "unvisited"} onClick={() => setHf({ ...hf, history: "unvisited" })}>行ってない所だけ</Chip>
            <Chip active={hf.history === "excludeRecent"} onClick={() => setHf({ ...hf, history: "excludeRecent" })}>最近行った所はナシ</Chip>
          </Row>

          <FieldLabel eyebrow="MOOD" title="今日の気分（任意）" />
          <p style={{ fontFamily: SANS, fontSize: 12.5, color: C.muted, margin: "-4px 0 2px", lineHeight: 1.5 }}>
            選ぶと、その気分に合う場所が当たりやすくなります（候補は減りません）。あとの画面でも変えられます。
          </p>
          <WishPicker wishes={wishes} onToggle={toggleWish} />

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
                      timeText={hf.time ? timeText(st) : null}
                      excludedMark={excluded.includes(st.id)}
                      onToggleExclude={() => toggleExclude(st)}
                    />
                  </div>
                ))}
              </div>
              <div style={{ height: 22 }} />
              <Btn kind="dark" onClick={decideFromTen} disabled={remaining === 0}>
                🎲 ここから1つ決める！
              </Btn>
              <div style={{ height: 12 }} />
              <Btn onClick={goWishes}>気分を選ぶ・変える →</Btn>
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
        const pool = candidates.filter((s) => !excluded.includes(s.id));
        return (
        <Fade key="step3">
          <StepHead n="03" title="今日の気分は？" sub="えらぶほど、その気分に合う場所が当たりやすくなります。STEP1で選んだ分も反映済み。" />
          <Board count={pool.length} note="候補は減りません。当たりやすさが変わります。" />
          <div style={{ height: 4 }} />
          <WishPicker wishes={wishes} onToggle={toggleWish} />
          <div style={{ height: 18 }} />
          <Btn onClick={decideWithWishes} disabled={pool.length === 0}>🎲 この気分で1つ決める！</Btn>
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
            <Ticket st={chosen} timeText={hf.time || timeMap[chosen.id] != null ? timeText(chosen) : null} wishes={wishes} />
          </div>
          <div style={{ height: 22 }} />
          <VisitControl
            station={chosen}
            recorded={lastRecordedId === chosen.id}
            onRecorded={() => { recordVisit(chosen); setLastRecordedId(chosen.id); }}
          />
          <div style={{ height: 12 }} />
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <Btn kind="ghost" onClick={reroll} disabled={rerollUsed}>
                {rerollUsed ? "再抽選は1回まで" : "再度決め直す"}
              </Btn>
            </div>
            <div style={{ flex: 1 }}>
              <Btn kind="ghost" onClick={resetFlow}>最初から</Btn>
            </div>
          </div>
          {rerollUsed && (
            <p style={{ fontFamily: SANS, fontSize: 12, color: C.muted, textAlign: "center", marginTop: 12 }}>
              決め直しは1回まで。今日はこの縁で。
            </p>
          )}
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
          <SmallBtn onClick={() => onAdd(st)} disabled={recorded}>＋1</SmallBtn>
          <SmallBtn danger onClick={() => onRemove(st)} disabled={st.visitCount <= 0}>−1</SmallBtn>
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
const miniLink = {
  background: "none", border: `1px solid ${C.line}`, borderRadius: 999, padding: "7px 14px",
  fontFamily: SANS, fontSize: 13, color: C.inkSoft, cursor: "pointer", fontWeight: 600,
};

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
