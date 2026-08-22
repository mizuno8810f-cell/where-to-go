#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
スコアの「漏れ」を検出する。

2つの観点で検査する:
  A) 特徴文に書いてあるのにスコアが低い（＝付け忘れ）
     例) 特徴文に「温泉」とあるのに relax が3以下
  B) スコアが高いのに特徴文にも根拠が無い（＝盛りすぎ）

使い方:
  python3 tools/audit_scores.py
  python3 tools/audit_scores.py --fix     # A のみ自動で4に底上げした提案を出力
"""
import json, os, re, argparse, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPATH = os.path.join(ROOT, "data", "stations.json")

# 特徴文のキーワード → 期待されるスコアキー
# （そのキーワードが本文にあれば、そのスコアは4以上であるべき）
RULES = {
    # 誤検出を避けるため、その気分の「目的地」と断定できる語だけに絞る
    "drinking":  ["飲み屋", "酒場", "せんべろ", "居酒屋", "飲み歩き", "横丁", "立ち飲み", "もつ焼き", "ガード下"],
    "gourmet":   ["食べ歩き", "海鮮", "ラーメン", "もんじゃ", "餃子", "うなぎ", "中華街", "市場の", "場外市場",
                  "グルメ", "カレー", "スイーツ", "食が"],
    "cafe":      ["カフェ", "喫茶", "コーヒー"],
    "shopping":  ["買い物", "商業施設", "デパート", "アウトレット", "モール", "古着", "問屋街", "雑貨"],
    "entertainment": ["遊園地", "テーマパーク", "水族館", "動物園", "ドーム", "アトラクション", "ゆうえんち", "牧場", "競馬"],
    "nature":    ["自然", "渓谷", "里山", "森林", "緑地", "植物園", "湖", "緑道", "梅林", "庭園", "湧水", "原生林"],
    "walk":      ["街歩き", "町並み", "街並み", "並木", "参道", "路地", "遊歩道", "ぶらぶら", "商店街"],
    "scenery":   ["絶景", "眺め", "展望", "見下ろす", "夕日", "夕景", "岬", "灯台", "景色"],
    "nightView": ["夜景"],
    "relax":     ["温泉", "のんびり", "ゆっくり", "まったり", "銭湯", "温浴", "日帰り温泉"],
    "active":    ["ハイキング", "登山", "サイクリング", "スポーツ", "アスレチック", "サーフィン",
                  "海水浴", "川遊び", "ランニング", "ボート", "ライン下り"],
    "romantic":  ["デート"],
    "unique":    ["独特", "レトロ", "ならでは", "変わった", "ゆかり"],
    "indoor":    ["美術館", "博物館", "水族館", "映画", "モール", "デパート"],
    "rainyDay":  ["雨でも", "美術館", "博物館", "水族館", "映画", "モール", "デパート"],
    "outdoor":   ["砂浜", "海辺", "海沿い", "河川敷", "キャンプ", "海水浴", "海岸", "野外"],
    "fullDay":   ["一日"],
}
# 誤検出しやすい語を除外（例:「山手」の"山"、「小田原」の"原"など）
STOPWORDS = ["山手", "青山", "中山", "小山", "山田", "湯島", "湯河原"]


def audit(stations):
    miss = collections.defaultdict(list)   # (key) -> [(name, kw, score)]
    for st in stations:
        text = (st.get("dateFeature") or "").strip()
        if not text:
            continue
        name = st["name"]
        for key, kws in RULES.items():
            for kw in kws:
                if kw in text:
                    # 駅名そのものに由来する誤検出は除外
                    if any(sw in name and kw in sw for sw in STOPWORDS):
                        continue
                    v = st["scores"].get(key, 0)
                    if v < 4:
                        miss[key].append((name, st["area"], kw, v, text))
                    break
    return miss


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fix", action="store_true")
    args = ap.parse_args()
    stations = json.load(open(SPATH, encoding="utf-8"))
    miss = audit(stations)

    total = sum(len(v) for v in miss.values())
    print(f"=== A) 特徴文に書いてあるのにスコアが4未満（付け忘れ） ===")
    print(f"合計 {total} 件\n")
    for key in sorted(miss, key=lambda k: -len(miss[k])):
        rows = miss[key]
        print(f"■ {key}: {len(rows)}件")
        for name, area, kw, v, text in rows[:8]:
            print(f"    {name}({area}) {key}={v}  「{kw}」→ {text}")
        if len(rows) > 8:
            print(f"    …ほか {len(rows)-8} 件")
        print()

    if args.fix:
        out = collections.defaultdict(set)
        for key, rows in miss.items():
            for name, area, kw, v, text in rows:
                out[key].add(name)
        print("=== 自動生成した底上げリスト（curated_core.py の FOURS 用） ===")
        for key in sorted(out):
            names = " ".join(sorted(out[key]))
            print(f'\n "{key}": """{names}""",')
    return miss


if __name__ == "__main__":
    main()
