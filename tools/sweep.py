#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
100ラウンドのランダム化スイープで「漏れ」を洗い出す。
毎ラウンド、出発駅・気分の組み合わせ・時間・種別をランダムに振り直した
100通りの条件を作り、候補が10件に満たない条件を集計する。
（1ラウンド100条件 × 100ラウンド = 10,000条件）
"""
import sys, os, random, collections, statistics
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from simulate import (STATIONS, MOOD_LABEL, shortest_times, apply_hard,
                      dedupe_by_name, PRIORITY_SET)

by = {s["name"]: s for s in STATIONS}
HOMES = [h for h in [
 "新宿","渋谷","池袋","東京","品川","上野","北千住","錦糸町","蒲田","吉祥寺","中野","高円寺","三軒茶屋",
 "自由が丘","二子玉川","立川","町田","八王子","調布","府中","赤羽","大井町","五反田","恵比寿","中目黒",
 "下北沢","練馬","葛西","荻窪","三鷹","国分寺","日暮里","王子","綾瀬","北綾瀬",
 "横浜","川崎","武蔵小杉","溝の口","たまプラーザ","青葉台","戸塚","上大岡","藤沢","大船","本厚木","海老名",
 "相模大野","橋本","新百合ヶ丘","日吉","鶴見","登戸","中央林間","上溝",
 "大宮(埼玉)","浦和","川口","所沢","越谷レイクタウン","川越","朝霞","志木","熊谷","春日部","草加","飯能",
 "千葉","船橋","柏","松戸","津田沼","海浜幕張","市川","本八幡","新浦安","木更津","成田","佐倉","茂原",
] if h in by]
MOODS = list(MOOD_LABEL)
TIMES = [30, 45, 60, 60, 60, 90, 120]     # 既定の60分を厚めに
PRIOS = ["standard", "standard", "hidden", "adventure"]  # 既定の定番を厚めに


def pool(home, wishes, prio, tmax):
    tmap = shortest_times(by[home]["id"])
    tf = [{"map": tmap, "min": 0, "max": tmax}]
    return len(dedupe_by_name(apply_hard(STATIONS, {"priority": prio, "timeOn": True}, tf, wishes), tf))


def main():
    rounds, per = 100, 100
    fail = collections.Counter()      # 条件の内訳 -> 10件未満だった回数
    seen = collections.Counter()
    zero_total = thin_total = total = 0
    mood_fail = collections.Counter(); mood_seen = collections.Counter()
    for r in range(rounds):
        rng = random.Random(1000 + r)
        for _ in range(per):
            home = rng.choice(HOMES)
            nmood = rng.choices([0, 1, 1, 1, 2, 2, 3], k=1)[0]
            ks = rng.sample(MOODS, nmood)
            wishes = {k: ("top" if rng.random() < 0.18 else "on") for k in ks}
            prio = rng.choice(PRIOS); tmax = rng.choice(TIMES)
            n = pool(home, wishes, prio, tmax)
            total += 1
            key = tuple(sorted(ks))
            seen[key] += 1
            for k in ks:
                mood_seen[k] += 1
            if n == 0:
                zero_total += 1
            if n < 10:
                thin_total += 1
                fail[key] += 1
                for k in ks:
                    mood_fail[k] += 1
    print(f"=== 100ラウンド × 100条件 = {total} 条件 ===")
    print(f"  候補0件   : {zero_total:5d} ({zero_total/total*100:5.2f}%)")
    print(f"  10件未満  : {thin_total:5d} ({thin_total/total*100:5.2f}%)")
    print(f"\n=== 気分ごとの『10件未満になった率』 ===")
    for k, sn in mood_seen.most_common():
        if sn < 50:
            continue
        rate = mood_fail[k] / sn * 100
        mark = "  ← 漏れの疑い" if rate >= 30 else ("  ← やや" if rate >= 20 else "")
        print(f"  {MOOD_LABEL[k]:14s} {rate:5.1f}%  ({mood_fail[k]}/{sn}){mark}")
    print(f"\n=== 失敗しやすい気分の組み合わせ（20回以上出現） ===")
    rows = [(fail[k] / seen[k], seen[k], k) for k in seen if seen[k] >= 20 and fail[k]]
    rows.sort(reverse=True)
    for rate, sn, k in rows[:15]:
        lab = "+".join(MOOD_LABEL[x] for x in k) if k else "(条件なし)"
        print(f"  {rate*100:5.1f}%  ({int(rate*sn)}/{sn})  {lab}")


if __name__ == "__main__":
    main()
