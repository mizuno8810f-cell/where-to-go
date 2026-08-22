#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
data/stations.json の dateFeature（街の特徴）と scores を補完・修正する。

背景
  - pr=3 の 1246 駅は dateFeature が空で、スコアも全項目1のプレースホルダ。
    そのままだと「気分」を1つでも選んだ瞬間に必ず候補から外れる。
  - ここでは「実在の特徴を確実に説明できる駅」だけを手作業でキュレーションし、
    特徴文とスコアの両方を与える。推測で埋めることはしない。

使い方
  python3 tools/enrich_features.py --dry-run   # 差分の確認だけ
  python3 tools/enrich_features.py             # data/stations.json を更新
"""
import json, argparse, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = os.path.join(ROOT, "data", "stations.json")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from curated_features import CURATED, SCORE_FIXES, PROFILES, KEYS, BASE
from curated_core import CORE


def build_scores(profile, over):
    s = dict(BASE)
    if profile:
        s.update(PROFILES[profile])
    s.update(over or {})
    return s


def key_variants(st):
    """(駅名, エリア) 優先、無ければ駅名のみで引く"""
    return [(st["name"], st["area"]), st["name"]]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    data = json.load(open(PATH, encoding="utf-8"))

    filled, rescored, fixed, unmatched = 0, 0, 0, []
    used = set()

    cored = 0
    for st in data:
        # ① 中核駅(pr=1,2)は CORE で特徴文もスコアも書き直す
        if st["name"] in CORE:
            feature, scores = CORE[st["name"]]
            st["dateFeature"] = feature
            st["scores"] = dict(scores)
            cored += 1
            used.add(st["name"])
            continue

        # ② それ以外は、プレースホルダ状態(pr=3)の駅だけ補完する
        for k in key_variants(st):
            if k in CURATED:
                used.add(k)
                if (st.get("dateFeature") or "").strip():
                    break
                feature, profile, over = CURATED[k]
                st["dateFeature"] = feature
                st["scores"] = build_scores(profile, over)
                filled += 1
                rescored += 1
                break

        # ③ CORE の対象外で、記述とスコアが矛盾しているものを補正
        for k in key_variants(st):
            if k in SCORE_FIXES:
                st["scores"].update(SCORE_FIXES[k])
                fixed += 1
                used.add(k)
                break

    print(f"中核駅(pr=1,2)を書き直し: {cored} 駅")

    for k in list(CORE) + list(CURATED) + list(SCORE_FIXES):
        if k not in used:
            unmatched.append(k)

    print(f"特徴を補完: {filled} 駅")
    print(f"スコアを設定: {rescored} 駅")
    print(f"既存スコアの矛盾を補正: {fixed} 駅")
    if unmatched:
        print(f"\n⚠ データに見つからなかったキー ({len(unmatched)}):")
        for k in unmatched:
            print("   ", k)

    still = [s for s in data if not (s.get("dateFeature") or "").strip()]
    print(f"\n残りの未設定: {len(still)} 駅")

    if args.dry_run:
        print("\n(--dry-run のため書き込みませんでした)")
        return

    with open(PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"\n書き込みました: {PATH}")


if __name__ == "__main__":
    main()
