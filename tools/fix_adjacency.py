#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
data/adjacency.json の欠落した接続を補う。

シミュレーション(tools/simulate.py)で、隣接グラフが43個の連結成分に
分断されていることが判明した。大宮・所沢・熊谷などの主要駅が完全に孤立し、
秩父・館山・佐原・養老渓谷といった観光地も本線から切り離されていたため、
時間フィルタON（既定）では永久に候補に出てこなかった。

ここでは実在の路線の隣接関係だけを追加する（推測で繋がない）。
所要時間はその区間の実際の乗車時間の目安。

使い方:
  python3 tools/fix_adjacency.py --dry-run
  python3 tools/fix_adjacency.py
"""
import json, os, argparse, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPATH = os.path.join(ROOT, "data", "stations.json")
APATH = os.path.join(ROOT, "data", "adjacency.json")

# (駅A, 駅B, 所要分) — 実在の隣接駅どうしのみ
EDGES = [
    # --- 大宮のハブを復旧（大宮が完全孤立していた） ---
    ("大宮(埼玉)", "さいたま新都心", 3),    # JR
    ("大宮(埼玉)", "宮原", 5),              # 高崎線
    ("大宮(埼玉)", "北大宮", 2),            # 東武アーバンパークライン
    ("大宮(埼玉)", "鉄道博物館", 3),        # ニューシャトル
    ("大宮(埼玉)", "日進(埼玉)", 4),        # 川越線

    # --- 高崎線（熊谷が孤立し、深谷・本庄まで切断されていた） ---
    ("行田", "熊谷", 5),
    ("熊谷", "籠原", 5),

    # --- 秩父鉄道（羽生〜三峰口。長瀞・秩父が切断されていた） ---
    ("羽生", "西羽生", 3),
    ("持田", "ソシオ流通センター", 3),
    ("ソシオ流通センター", "熊谷", 3),
    ("熊谷", "上熊谷", 3),
    ("永田(埼玉)", "ふかや花園", 3),
    ("ふかや花園", "小前田", 3),
    ("桜沢(埼玉)", "寄居", 3),

    # --- 八高線・東武東上線（寄居・小川町・越生方面） ---
    ("高麗川", "毛呂", 5),
    ("小川町(埼玉)", "武蔵嵐山", 5),

    # --- 越生線 ---
    ("坂戸", "一本松(埼玉)", 4),

    # --- 川越線（川越が切断されていた） ---
    ("日進(埼玉)", "西大宮", 3),
    ("西大宮", "指扇", 3),
    ("武蔵高萩", "高麗川", 5),
    ("川越", "新河岸", 4),                 # 東武東上線

    # --- 西武（所沢が完全孤立していた） ---
    ("所沢", "秋津", 4),
    ("所沢", "西所沢", 2),
    ("所沢", "航空公園", 2),
    ("西所沢", "下山口", 4),               # 狭山線
    ("吾野", "西吾野", 5),                 # 西武秩父線

    # --- 埼玉高速鉄道 ---
    ("赤羽岩淵", "川口元郷", 3),
    ("戸塚安行", "東川口", 4),

    # --- 東武日光線 ---
    ("春日部", "杉戸高野台", 6),
    ("南栗橋", "栗橋", 4),
    ("栗橋", "新古河", 5),

    # --- 武蔵野線（越谷レイクタウンが切断されていた） ---
    ("越谷レイクタウン", "吉川", 3),
    ("吉川美南", "新三郷", 4),

    # --- 東武アーバンパークライン（岩槻・野田・流山方面） ---
    ("八木崎", "春日部", 3),
    ("柏", "豊四季", 3),
    ("船橋", "新船橋", 3),

    # --- 総武本線・外房線・内房線（千葉から南房総・外房が切断されていた） ---
    ("千葉", "本千葉", 3),                 # → 蘇我・館山・鴨川方面へ繋がる
    ("千葉", "東千葉", 2),                 # → 佐倉・銚子方面へ繋がる
    ("浜野", "蘇我", 4),                   # 内房線と外房線の接続
    ("佐倉", "酒々井", 4),                 # → 成田・佐原方面

    # --- 小湊鐵道・いすみ鉄道・久留里線（養老渓谷・大多喜・久留里） ---
    ("五井", "上総村上", 4),
    ("養老渓谷", "上総中野", 8),
    ("大原(千葉)", "西大原", 4),
    ("木更津", "祇園(千葉)", 5),

    # --- 東金線 ---
    ("大網", "福俵", 5),

    # --- 銚子電鉄 ---
    ("銚子", "仲ノ町", 3),

    # --- 成田線我孫子支線 ---
    ("我孫子", "東我孫子", 4),

    # --- 成田空港・芝山鉄道・成田スカイアクセス ---
    ("成田空港（成田第１ターミナル）", "空港第２ビル（成田第２・第３ターミナル）", 3),
    ("東成田", "芝山千代田", 4),
    ("印旛日本医大", "成田湯川", 8),
    ("成田湯川", "空港第２ビル（成田第２・第３ターミナル）", 9),

    # --- 鹿島線 ---
    ("香取", "十二橋", 5),

    # --- 新京成線 ---
    ("松戸", "上本郷", 4),
    ("新津田沼", "京成津田沼", 3),

    # --- 京成千葉線・千原線 ---
    ("京成津田沼", "京成幕張本郷", 5),
    ("千葉中央", "千葉寺", 4),

    # --- 千葉都市モノレール ---
    ("千葉", "千葉公園", 3),
    ("千葉", "市役所前(千葉)", 2),

    # --- 東葉高速線 ---
    ("西船橋", "東海神", 3),
    ("東葉勝田台", "勝田台", 2),

    # --- 山万ユーカリが丘線 ---
    ("ユーカリが丘", "地区センター", 2),

    # --- 流鉄流山線 ---
    ("馬橋", "幸谷", 3),

    # --- ディズニーリゾートライン ---
    ("舞浜", "リゾートゲートウェイ・ステーション", 3),

    # --- 上越新幹線のみの駅（在来線接続が無いため本庄から接続扱い） ---
    ("本庄", "本庄早稲田", 10),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    stations = json.load(open(SPATH, encoding="utf-8"))
    adj = json.load(open(APATH, encoding="utf-8"))

    by_name = collections.defaultdict(list)
    for s in stations:
        by_name[s["name"]].append(s["id"])

    added, skipped, missing = 0, 0, []
    for a, b, w in EDGES:
        if a not in by_name or b not in by_name:
            missing.append((a, b))
            continue
        # 同名駅が複数ある場合は全ての組み合わせを繋ぐ（路線違いの同一駅のため）
        for ia in by_name[a]:
            for ib in by_name[b]:
                for src, dst in ((ia, ib), (ib, ia)):
                    lst = adj.setdefault(src, [])
                    if any(x[0] == dst for x in lst):
                        skipped += 1
                        continue
                    lst.append([dst, w])
                    added += 1

    print(f"追加した接続: {added} 本 (既存でスキップ: {skipped})")
    if missing:
        print(f"⚠ 駅名が見つからず追加できなかった区間 ({len(missing)}):")
        for a, b in missing:
            print(f"    {a} — {b}")

    # 連結成分を再計算
    ids = {s["id"] for s in stations}
    g = collections.defaultdict(set)
    for k, vs in adj.items():
        for v, w in vs:
            g[k].add(v); g[v].add(k)
    seen, comps = set(), []
    for sid in ids:
        if sid in seen:
            continue
        stack, comp = [sid], []
        seen.add(sid)
        while stack:
            u = stack.pop(); comp.append(u)
            for v in g.get(u, ()):
                if v in ids and v not in seen:
                    seen.add(v); stack.append(v)
        comps.append(comp)
    comps.sort(key=len, reverse=True)
    print(f"\n連結成分: {len(comps)}個 / 最大 {len(comps[0])}駅 "
          f"({len(comps[0])/len(ids)*100:.1f}%)")
    byid = {s["id"]: s for s in stations}
    for c in comps[1:]:
        print(f"   残: {len(c):3d}駅  {' '.join(byid[i]['name'] for i in c[:8])}")

    if args.dry_run:
        print("\n(--dry-run のため書き込みませんでした)")
        return
    with open(APATH, "w", encoding="utf-8") as f:
        json.dump(adj, f, ensure_ascii=False)
    print(f"\n書き込みました: {APATH}")


if __name__ == "__main__":
    main()
