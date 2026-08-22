#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ペルソナ100組 × 50回 = 5000試行のシミュレーション。
絶対条件で絞り込んだ結果の10件が妥当かを検証する。

app.js のロジックを厳密に再現する:
  applyHard(全駅, hf, timeFilters, hardWishes)
    → dedupeByName(name+area, 最短時間が短い方を代表)
    → sampleBy(候補, 10, historyWeight)   ※visitCount=0なので等確率

使い方:
  python3 tools/simulate.py
"""
import json, os, random, heapq, collections, statistics

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIONS = json.load(open(os.path.join(ROOT, "data", "stations.json"), encoding="utf-8"))
ADJ = json.load(open(os.path.join(ROOT, "data", "adjacency.json"), encoding="utf-8"))

PRIORITY_SET = {"standard": [1], "hidden": [1, 2], "adventure": [1, 2, 3]}

MOOD_LABEL = {
    "drinking": "飲みに行きたい", "gourmet": "ご飯を楽しみたい", "cafe": "カフェに行きたい",
    "shopping": "買い物したい", "entertainment": "何かして遊びたい", "nature": "自然に行きたい",
    "walk": "ぶらぶらしたい", "scenery": "景色を見たい", "nightView": "夜景を見たい",
    "relax": "まったりしたい", "active": "アクティブに", "romantic": "デートっぽく",
    "unique": "ちょっと変わった", "rainyDay": "雨でも楽しみたい", "indoor": "屋内がいい",
    "outdoor": "外で遊びたい", "lateNight": "夜から遊びたい", "fullDay": "一日遊びたい",
    "shortStay": "少しだけ",
}

_dist_cache = {}


def shortest_times(source_id):
    """app.js の shortestTimes と同じダイクストラ"""
    if source_id in _dist_cache:
        return _dist_cache[source_id]
    dist = {source_id: 0}
    done = set()
    pq = [(0, source_id)]
    while pq:
        d, u = heapq.heappop(pq)
        if u in done:
            continue
        done.add(u)
        for v, w in ADJ.get(u, []):
            nd = d + w
            if dist.get(v) is None or nd < dist[v]:
                dist[v] = nd
                heapq.heappush(pq, (nd, v))
    _dist_cache[source_id] = dist
    return dist


def apply_hard(stations, hf, time_filters, wishes):
    allowed = PRIORITY_SET[hf["priority"]]
    out = []
    for st in stations:
        if st["searchPriority"] not in allowed:
            continue
        if hf["timeOn"] and time_filters:
            ok = True
            for f in time_filters:
                t = f["map"].get(st["id"])
                upper = float("inf") if f["max"] >= 120 else f["max"]
                if t is None or t < f["min"] or t > upper:
                    ok = False
                    break
            if not ok:
                continue
        bad = False
        for k, mode in wishes.items():
            need = 5 if mode == "top" else 4
            if st["scores"].get(k, 0) < need:
                bad = True
                break
        if bad:
            continue
        out.append(st)
    return out


def max_time(st, time_filters):
    m = 0
    for f in time_filters:
        t = f["map"].get(st["id"])
        if t is None:
            return None
        m = max(m, t)
    return m


def dedupe_by_name(lst, time_filters):
    """app.js の dedupeByName（キー=駅名+エリア、最短時間が短い方を代表）"""
    def rank(st):
        m = max_time(st, time_filters) if time_filters else 0
        return float("inf") if m is None else m
    best = {}
    for st in lst:
        k = (st["name"], st["area"])
        if k not in best or rank(st) < rank(best[k]):
            best[k] = st
    seen, out = set(), []
    for st in lst:
        k = (st["name"], st["area"])
        if k in seen:
            continue
        seen.add(k)
        out.append(best[k])
    return out


def sample_n(pool, n, rng):
    """historyWeight は訪問0なら全て1 → 等確率の非復元抽出"""
    return rng.sample(pool, min(n, len(pool)))


# =====================================================================
# ペルソナ100組
# =====================================================================
def build_personas():
    by_name = {s["name"]: s for s in STATIONS}
    # 現実的な「住んでいそうな駅」
    HOMES = ["新宿", "渋谷", "池袋", "東京", "品川", "上野", "北千住", "錦糸町", "蒲田", "吉祥寺",
             "中野", "高円寺", "三軒茶屋", "自由が丘", "二子玉川", "立川", "町田", "八王子", "調布",
             "府中", "赤羽", "大井町", "五反田", "恵比寿", "中目黒", "下北沢", "練馬", "葛西",
             "横浜", "川崎", "武蔵小杉", "溝の口", "たまプラーザ", "青葉台", "戸塚", "上大岡",
             "藤沢", "大船", "本厚木", "海老名", "相模大野", "橋本", "新百合ヶ丘", "日吉", "鶴見",
             "大宮(埼玉)", "浦和", "川口", "所沢", "越谷レイクタウン", "川越", "朝霞", "志木", "熊谷",
             "千葉", "船橋", "柏", "松戸", "津田沼", "海浜幕張", "市川", "本八幡", "新浦安", "木更津"]
    HOMES = [h for h in HOMES if h in by_name]

    # (気分の組み合わせ, ラベル) — 実際に選びそうなパターン
    MOODSETS = [
        ({}, "こだわりなし"),
        ({"gourmet": "on"}, "ご飯"),
        ({"drinking": "on"}, "飲み"),
        ({"cafe": "on"}, "カフェ"),
        ({"nature": "on"}, "自然"),
        ({"romantic": "on"}, "デート"),
        ({"shopping": "on"}, "買い物"),
        ({"entertainment": "on"}, "遊ぶ"),
        ({"relax": "on"}, "まったり"),
        ({"walk": "on"}, "ぶらぶら"),
        ({"unique": "on"}, "変わった"),
        ({"scenery": "on"}, "景色"),
        ({"nightView": "on"}, "夜景"),
        ({"rainyDay": "on"}, "雨でも"),
        ({"outdoor": "on"}, "外で遊ぶ"),
        ({"active": "on"}, "アクティブ"),
        ({"romantic": "top"}, "★デート"),
        ({"nature": "top"}, "★自然"),
        ({"drinking": "top"}, "★飲み"),
        ({"nightView": "top"}, "★夜景"),
        ({"cafe": "top"}, "★カフェ"),
        ({"unique": "top"}, "★変わった"),
        ({"gourmet": "on", "drinking": "on"}, "ご飯+飲み"),
        ({"cafe": "on", "walk": "on"}, "カフェ+ぶらぶら"),
        ({"nature": "on", "outdoor": "on"}, "自然+外"),
        ({"romantic": "on", "scenery": "on"}, "デート+景色"),
        ({"gourmet": "on", "romantic": "on"}, "ご飯+デート"),
        ({"shopping": "on", "rainyDay": "on"}, "買い物+雨"),
        ({"relax": "on", "nature": "on"}, "まったり+自然"),
        ({"drinking": "on", "lateNight": "on"}, "飲み+夜から"),
        ({"romantic": "top", "nightView": "on"}, "★デート+夜景"),
        ({"nature": "top", "active": "on"}, "★自然+アクティブ"),
    ]
    TIMES = [(0, 30), (0, 45), (0, 60), (0, 90), (0, 120), (30, 90)]
    PRIOS = ["standard", "hidden", "adventure"]

    rng = random.Random(20260822)
    personas = []
    for i in range(100):
        home = HOMES[i % len(HOMES)]
        moods, mlabel = MOODSETS[i % len(MOODSETS)]
        tmin, tmax = TIMES[i % len(TIMES)]
        prio = PRIOS[i % len(PRIOS)]
        personas.append({
            "id": i + 1,
            "home": home,
            "home_id": by_name[home]["id"],
            "moods": dict(moods),
            "mood_label": mlabel,
            "time": (tmin, tmax),
            "priority": prio,
            "label": f"{home}発 / {mlabel} / {tmin}〜{'上限なし' if tmax>=120 else str(tmax)+'分'} / "
                     f"{ {'standard':'定番','hidden':'穴場も','adventure':'超冒険'}[prio] }",
        })
    return personas


def run():
    personas = build_personas()
    rng = random.Random(7)
    RUNS = 50

    rows = []           # 1試行ごとの記録
    zero_personas = []  # 候補0のペルソナ
    for p in personas:
        tmap = shortest_times(p["home_id"])
        tf = [{"map": tmap, "min": p["time"][0], "max": p["time"][1]}]
        hf = {"priority": p["priority"], "timeOn": True}
        cands = dedupe_by_name(apply_hard(STATIONS, hf, tf, p["moods"]), tf)
        p["pool"] = len(cands)
        if not cands:
            zero_personas.append(p)
        seen = collections.Counter()
        for _ in range(RUNS):
            shown = sample_n(cands, 10, rng)
            for st in shown:
                seen[st["name"]] += 1
            rows.append({"p": p, "shown": shown, "tf": tf})
        p["unique_seen"] = len(seen)
        p["top_share"] = (seen.most_common(1)[0][1] / (RUNS * 10)) if seen else 0
    return personas, rows, zero_personas


def report():
    personas, rows, zero_personas = run()
    print("=" * 68)
    print(f"ペルソナ {len(personas)}組 × 50回 = {len(rows)}試行")
    print("=" * 68)

    # ---------- ① 候補が10件揃うか ----------
    counts = collections.Counter(len(r["shown"]) for r in rows)
    full = counts.get(10, 0)
    zero = counts.get(0, 0)
    print(f"\n【① 10件揃ったか】")
    print(f"  10件ちょうど : {full:5d} 試行 ({full/len(rows)*100:5.1f}%)")
    print(f"  1〜9件       : {sum(v for k,v in counts.items() if 1<=k<=9):5d} 試行")
    print(f"  0件（全滅）  : {zero:5d} 試行 ({zero/len(rows)*100:5.1f}%)")
    short = sorted([p for p in personas if 0 < p["pool"] < 10], key=lambda x: x["pool"])
    if short:
        print(f"  ※候補が10件未満のペルソナ {len(short)}組:")
        for p in short[:12]:
            print(f"      {p['pool']:2d}件  {p['label']}")

    # ---------- ② 絶対条件を本当に満たしているか ----------
    viol_time = viol_mood = viol_prio = 0
    for r in rows:
        p, tf = r["p"], r["tf"]
        for st in r["shown"]:
            t = tf[0]["map"].get(st["id"])
            up = float("inf") if p["time"][1] >= 120 else p["time"][1]
            if t is None or t < p["time"][0] or t > up:
                viol_time += 1
            for k, mode in p["moods"].items():
                if st["scores"].get(k, 0) < (5 if mode == "top" else 4):
                    viol_mood += 1
            if st["searchPriority"] not in PRIORITY_SET[p["priority"]]:
                viol_prio += 1
    print(f"\n【② 絶対条件の遵守】(違反は0であるべき)")
    print(f"  所要時間の違反   : {viol_time}")
    print(f"  気分スコアの違反 : {viol_mood}")
    print(f"  優先度の違反     : {viol_prio}")

    # ---------- ③ 気分との適合度 ----------
    print(f"\n【③ 気分の適合度】選んだ気分スコアの平均（4以上が条件）")
    per_mood = collections.defaultdict(list)
    for r in rows:
        for k in r["p"]["moods"]:
            for st in r["shown"]:
                per_mood[k].append(st["scores"].get(k, 0))
    for k, vs in sorted(per_mood.items(), key=lambda x: -len(x[1])):
        print(f"  {MOOD_LABEL[k]:14s} 平均{statistics.mean(vs):.2f}  "
              f"(5の割合 {sum(1 for v in vs if v==5)/len(vs)*100:4.1f}%)  n={len(vs)}")

    # ---------- ④ 特徴文が空の駅が出ていないか ----------
    blank = collections.Counter()
    for r in rows:
        for st in r["shown"]:
            if not (st.get("dateFeature") or "").strip():
                blank[st["name"]] += 1
    total_shown = sum(len(r["shown"]) for r in rows)
    nb = sum(blank.values())
    print(f"\n【④ 特徴文が空のまま表示された件数】")
    print(f"  {nb} / {total_shown} 件 ({nb/total_shown*100:.1f}%)")
    if blank:
        print("  よく出る空の駅:", "  ".join(f"{n}({c})" for n, c in blank.most_common(10)))

    # ---------- ⑤ 多様性（毎回同じ駅ばかりになっていないか） ----------
    print(f"\n【⑤ 多様性】50回で見えたユニーク駅数 / 最頻駅の出現率")
    uniq = [p["unique_seen"] for p in personas]
    share = [p["top_share"] for p in personas]
    print(f"  ユニーク駅数  中央値{statistics.median(uniq):.0f} / 最小{min(uniq)} / 最大{max(uniq)}")
    print(f"  最頻駅の出現率 中央値{statistics.median(share)*100:.1f}% / 最大{max(share)*100:.1f}%")
    stuck = [p for p in personas if p["top_share"] >= 0.9]
    if stuck:
        print(f"  ※ほぼ毎回同じ駅が出るペルソナ {len(stuck)}組:")
        for p in stuck[:8]:
            print(f"      候補{p['pool']:2d}件  {p['label']}")

    # ---------- ⑥ 到達時間の分布 ----------
    times = []
    for r in rows:
        for st in r["shown"]:
            t = r["tf"][0]["map"].get(st["id"])
            if t is not None:
                times.append(t)
    print(f"\n【⑥ 提案された駅までの所要時間】")
    print(f"  中央値 {statistics.median(times):.0f}分 / 平均 {statistics.mean(times):.0f}分 / 最大 {max(times)}分")

    # ---------- ⑦ pr別の内訳 ----------
    prc = collections.Counter()
    for r in rows:
        for st in r["shown"]:
            prc[st["searchPriority"]] += 1
    print(f"\n【⑦ 提案された駅の種別】")
    for k in sorted(prc):
        lab = {1: "定番", 2: "穴場", 3: "冒険"}[k]
        print(f"  {lab}: {prc[k]:6d} 件 ({prc[k]/total_shown*100:5.1f}%)")

    return personas, rows, zero_personas


if __name__ == "__main__":
    report()
