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
from collections import Counter as collections_Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = os.path.join(ROOT, "data", "stations.json")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from curated_features import CURATED, SCORE_FIXES, PROFILES, KEYS, BASE
from curated_core import CORE, FIVES, FOURS, PRIORITY_FIX, ICONIC


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

    # ①.5 種別(searchPriority)の分類漏れを補正。CORE適用より先に効かせる必要は無いが、
    #      pr が変わると CORE の対象範囲も変わるため、ここで反映する。
    prfix = 0
    for st in data:
        if st["name"] in PRIORITY_FIX and st["searchPriority"] != PRIORITY_FIX[st["name"]]:
            st["searchPriority"] = PRIORITY_FIX[st["name"]]
            prfix += 1
    print(f"中核駅(pr=1,2)を書き直し: {cored} 駅 / 種別の分類を補正: {prfix} 駅")

    # ④ 「5」の較正：長押し(★最優先)で残るのは代表格だけにする。
    #    ホワイトリストに載っていれば 5 に、載っていない 5 は 4 に落とす。
    promoted = demoted = 0
    for st in data:
        for mood, names in FIVES.items():
            cur = st["scores"].get(mood, 0)
            if st["name"] in names:
                if cur < 5:
                    st["scores"][mood] = 5
                    promoted += 1
            elif cur >= 5:
                st["scores"][mood] = 4
                demoted += 1
    # ⑤ 「4」の下限保証：その気分で十分成立する駅は最低4にする
    floored = 0
    for st in data:
        for mood, names in FOURS.items():
            if st["name"] in names and st["scores"].get(mood, 0) < 4:
                st["scores"][mood] = 4
                floored += 1
    print(f"5に格上げ: {promoted} 件 / 5→4に格下げ: {demoted} 件 / 4に底上げ: {floored} 件")

    # ⑤.5 スコア間の整合性ルール
    #     lateNight（夜から遊びたい）が「せんべろ・終電まで飲める街」だけに
    #     付いていて、神楽坂・月島・麻布十番・浅草のような「夜から出かければ
    #     十分成立する街」が2のままだった。ラベルの意味と合わないので底上げする。
    #       規則1: 飲めるなら夜から出かけられる → lateNight >= drinking
    #       規則2: 夜景があり、夜に開いている何か（買い物/遊ぶ/食事）もある
    #              → lateNight >= 4。夜景だけで夜は無人になる浜辺などは対象外。
    # 朝しか開いていないなど、規則2が明らかに当てはまらない駅は除外する。
    NIGHT_EXCEPT = {"市場前"}          # 豊洲市場は朝の街
    r1 = r2 = 0
    for st in data:
        sc = st["scores"]
        if sc.get("drinking", 0) > sc.get("lateNight", 0):
            sc["lateNight"] = sc["drinking"]
            r1 += 1
        elif (st["name"] not in NIGHT_EXCEPT and sc.get("nightView", 0) >= 4
              and max(sc.get("shopping", 0), sc.get("entertainment", 0), sc.get("gourmet", 0)) >= 4
              and sc.get("lateNight", 0) < 4):
            sc["lateNight"] = 4
            r2 += 1
    print(f"夜からを底上げ: 飲みに合わせて {r1} 駅 / 夜景＋夜に開く施設で {r2} 駅")

    # ⑥ 王道度(iconic)を付与。未指定は種別から決める。
    #    「定番だけ」で一様抽選になり、渋谷と高幡不動が同確率になる問題への対処。
    icn = collections_Counter()
    for st in data:
        v = ICONIC.get(st["name"])
        if v is None:
            v = {1: 3, 2: 2, 3: 1}[st["searchPriority"]]
        st["iconic"] = v
        icn[v] += 1
    print("王道度の分布: " + " / ".join(f"{k}:{icn[k]}駅" for k in sorted(icn, reverse=True)))
    for n in set(ICONIC) - {s["name"] for s in data}:
        unmatched.append(f"ICONIC の {n}")

    allnames_f = {s["name"] for s in data}
    for mood, names in FOURS.items():
        for n in names - allnames_f:
            unmatched.append(f"FOURS[{mood}] の {n}")

    # ホワイトリストにあるのにデータに無い駅名を警告
    allnames = {s["name"] for s in data}
    for mood, names in FIVES.items():
        for n in names - allnames:
            unmatched.append(f"FIVES[{mood}] の {n}")

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
