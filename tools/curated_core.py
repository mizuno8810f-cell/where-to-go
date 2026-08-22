# -*- coding: utf-8 -*-
"""
pr=1,2（272駅）の特徴文とスコアを1駅ずつ定義する。

このアプリの中核。元データは
  - 272駅に対しスコアのパターンが40種類しかなく（34駅が完全に同一スコア）、
  - 53駅が19項目中14項目以上を4以上に設定されていた（＝どの気分でも当たる）
ため、気分の絞り込みも重み付けもほとんど機能していなかった。
ここでは1駅ずつ、その街が本当に強い項目だけを4〜5にする。

方針
  - 未指定の項目は 2（＝可もなく不可もなく）。
  - 4 = その街の売りと言える / 5 = その街を代表する要素。
  - 4以上は原則 3〜8項目まで。何にでも4を付けない。
  - romantic・lateNight・fullDay・rainyDay は実態に合うときだけ上げる。

CORE[駅名 or "駅名(エリア)"] = (特徴文, スコアdict)
"""

KEYS = ["drinking","gourmet","cafe","shopping","entertainment","nature","walk","scenery",
        "nightView","indoor","outdoor","rainyDay","active","relax","romantic","unique",
        "lateNight","fullDay","shortStay"]

CORE = {}


def c(name, feature, **sc):
    bad = [k for k in sc if k not in KEYS]
    if bad:
        raise ValueError(f"{name}: 未知のスコアキー {bad}")
    s = {k: 2 for k in KEYS}
    s.update(sc)
    CORE[name] = (feature, s)

# =====================================================================
# 東京 pr=1
# =====================================================================
c("新宿", "買い物・飲食・映画までなんでも揃う一大ターミナル",
  drinking=5, gourmet=5, shopping=5, entertainment=4, cafe=4, indoor=4, rainyDay=4,
  lateNight=5, shortStay=4, fullDay=4, nightView=3, walk=3)
c("渋谷", "買い物・カフェ・映画と若者文化が詰まった街",
  shopping=5, gourmet=4, cafe=4, entertainment=5, drinking=4, indoor=4, rainyDay=4,
  lateNight=5, walk=4, shortStay=4, fullDay=4)
c("池袋", "水族館・映画・買い物と屋内で遊べる選択肢が多い",
  shopping=5, entertainment=5, gourmet=4, drinking=4, indoor=5, rainyDay=5,
  lateNight=4, fullDay=4, shortStay=4, cafe=3)
c("東京", "駅ナカと丸の内の街並み・皇居方面まで歩ける",
  shopping=5, gourmet=4, indoor=5, rainyDay=5, walk=4, scenery=4, cafe=3, shortStay=4, unique=3)
c("銀座", "老舗と話題の店が並ぶ王道の大人の街歩き",
  shopping=5, gourmet=5, cafe=5, walk=5, indoor=4, rainyDay=4, romantic=5, unique=3, drinking=4)
c("有楽町", "映画・買い物・銀座散策をまとめて楽しめる",
  shopping=4, entertainment=4, gourmet=4, indoor=4, rainyDay=4, walk=4, drinking=4, shortStay=4)
c("上野", "動物園・美術館・アメ横をまとめて楽しめる",
  entertainment=5, indoor=5, rainyDay=5, nature=4, walk=4, gourmet=4, drinking=4,
  unique=4, fullDay=5, outdoor=3)
c("秋葉原", "電気街とサブカルの店を掘るのが楽しい",
  shopping=5, entertainment=5, unique=5, indoor=4, rainyDay=4, gourmet=3, walk=4, fullDay=4)
c("浅草", "浅草寺と仲見世の食べ歩き・下町観光の王道",
  unique=5, walk=5, gourmet=5, scenery=4, shopping=4, outdoor=4, romantic=4,
  fullDay=4, drinking=4, shortStay=4)
c("表参道", "並木道とおしゃれなカフェ・ショップ巡り",
  cafe=5, shopping=5, walk=5, scenery=4, romantic=5, gourmet=4, shortStay=4)
c("明治神宮前〈原宿〉", "明治神宮の杜と原宿の店巡りを両方楽しめる",
  shopping=5, cafe=4, walk=5, nature=4, unique=4, gourmet=4, outdoor=3, romantic=4, fullDay=4)
c("恵比寿", "落ち着いた食事とガーデンプレイスの街歩き",
  gourmet=5, drinking=5, cafe=4, walk=4, romantic=5, nightView=4, shopping=3, lateNight=4)
c("六本木", "美術館と夜景、大人向けの食事が揃う",
  gourmet=5, drinking=5, nightView=5, indoor=4, rainyDay=4, romantic=5,
  entertainment=4, lateNight=5, unique=3)
c("目黒", "目黒川沿いの散歩と落ち着いた食事に向く",
  gourmet=4, cafe=4, walk=4, scenery=4, romantic=4, drinking=3, shortStay=4)
c("中目黒", "目黒川沿いの桜とカフェ・雑貨巡りが楽しい",
  cafe=5, walk=5, scenery=5, romantic=5, gourmet=4, shopping=4, drinking=4, shortStay=4)
c("代官山", "落ち着いたカフェと個性的なショップ巡り",
  cafe=5, shopping=5, walk=4, romantic=5, gourmet=4, scenery=3, shortStay=4)
c("自由が丘", "スイーツとカフェ・雑貨をゆったり巡れる",
  cafe=5, shopping=5, gourmet=4, walk=5, romantic=5, shortStay=4)
c("三軒茶屋", "個人店の飲食と路地の街歩きが楽しい",
  drinking=5, gourmet=5, cafe=4, walk=4, unique=4, lateNight=4, shortStay=4)
c("下北沢", "古着・ライブ・カフェとサブカルの街歩き",
  shopping=5, cafe=5, unique=5, gourmet=4, drinking=5, walk=5, entertainment=4,
  lateNight=4, shortStay=4)
c("中野", "サブカルの殿堂と飲み屋横丁を楽しめる",
  shopping=4, unique=5, drinking=5, gourmet=4, entertainment=4, indoor=4,
  rainyDay=4, lateNight=4, walk=4, shortStay=4)
c("高円寺", "古着と個人経営の酒場を掘るのが楽しい",
  drinking=5, shopping=5, unique=5, gourmet=4, cafe=4, walk=4, lateNight=5, shortStay=4)
c("吉祥寺", "井の頭公園と商店街・雑貨店が一度に楽しめる",
  nature=5, walk=5, shopping=5, gourmet=5, cafe=4, outdoor=4, romantic=4,
  drinking=4, unique=4, fullDay=4, scenery=4)
c("北千住", "下町の飲み屋街と商業施設の両方が揃う",
  drinking=5, gourmet=5, shopping=4, walk=4, unique=4, lateNight=4, shortStay=4, indoor=3)
c("錦糸町", "映画・買い物・飲食がコンパクトに揃う",
  shopping=4, entertainment=4, gourmet=4, drinking=4, indoor=4, rainyDay=4, lateNight=4, shortStay=4)
c("品川", "水族館と駅ナカグルメで雨でも過ごせる",
  entertainment=4, gourmet=4, indoor=5, rainyDay=5, shopping=4, walk=3, shortStay=4)
c("大井町", "映画と気取らない飲食店街が揃う",
  drinking=5, gourmet=4, entertainment=4, indoor=4, rainyDay=4, shopping=3, lateNight=4, shortStay=4)
c("大森", "商店街の飲食と大森海岸方面へ出やすい",
  gourmet=4, drinking=4, shopping=3, walk=4, entertainment=3, shortStay=4)
c("蒲田", "餃子と銭湯、気取らない商店街が楽しい",
  gourmet=5, drinking=5, unique=4, relax=4, entertainment=3, indoor=3, walk=4,
  lateNight=4, shortStay=4)
c("五反田", "目黒川沿いの散策と気軽な飲食が揃う",
  drinking=5, gourmet=4, entertainment=3, walk=4, scenery=3, lateNight=4, shortStay=4)
c("赤羽", "昼から開く酒場と商店街の食べ歩きが名物",
  drinking=5, gourmet=5, unique=5, walk=4, shopping=3, lateNight=5, shortStay=4)
c("日暮里", "谷中銀座と下町散策の入口として楽しめる",
  walk=5, unique=4, gourmet=4, cafe=3, scenery=3, shortStay=4)
c("飯田橋", "神楽坂と外濠沿いの散策に出やすい",
  gourmet=4, walk=4, scenery=4, drinking=4, cafe=3, romantic=3, shortStay=4)
c("神保町", "古書店街とカレー・老舗喫茶の食べ歩き",
  unique=5, gourmet=5, cafe=5, shopping=4, walk=5, indoor=3, shortStay=4)
c("新宿三丁目", "新宿の買い物と飲食に出やすく夜まで遊べる",
  shopping=5, gourmet=5, drinking=5, entertainment=4, cafe=4, indoor=4,
  rainyDay=4, lateNight=5, shortStay=4)
c("麻布十番", "老舗と食べ歩き、落ち着いた大人の街歩き",
  gourmet=5, cafe=4, walk=4, unique=4, romantic=4, drinking=4, shortStay=4)
c("汐留", "高層ビルの夜景と新橋方面の食事に便利",
  nightView=5, scenery=4, gourmet=4, drinking=4, indoor=4, rainyDay=4, romantic=4, walk=3)
c("浜松町", "浜離宮と東京タワー方面へ歩いて出られる",
  nature=4, walk=4, scenery=4, nightView=4, gourmet=3, outdoor=3, romantic=3)
c("豊洲", "豊洲市場の海鮮と湾岸の商業施設を楽しめる",
  gourmet=5, shopping=4, indoor=4, rainyDay=4, unique=4, walk=4, scenery=4, entertainment=3, fullDay=4)
c("有明", "大型イベントと湾岸の広い景色を楽しめる",
  entertainment=5, scenery=4, walk=4, shopping=4, indoor=4, rainyDay=4, unique=3, fullDay=4)
c("台場", "海辺の商業施設と夜景の王道デートスポット",
  entertainment=5, shopping=5, scenery=5, nightView=5, romantic=5, walk=4,
  indoor=4, rainyDay=4, outdoor=4, fullDay=5)
c("お台場海浜公園", "砂浜とレインボーブリッジの夜景を楽しめる",
  scenery=5, nightView=5, walk=5, outdoor=5, romantic=5, nature=4, relax=4,
  shopping=4, entertainment=4, fullDay=4)
c("葛西臨海公園", "水族館と海辺の広い公園で一日過ごせる",
  entertainment=5, nature=5, outdoor=5, walk=5, scenery=5, indoor=4, rainyDay=4,
  romantic=4, relax=4, fullDay=5, active=3)
c("とうきょうスカイツリー", "スカイツリーの展望と商業施設を楽しめる",
  scenery=5, nightView=5, entertainment=5, shopping=5, indoor=5, rainyDay=5,
  unique=5, gourmet=4, romantic=5, fullDay=4)
c("二子玉川", "多摩川の河川敷と商業施設を一度に楽しめる",
  shopping=5, nature=4, walk=5, scenery=4, cafe=4, outdoor=4, gourmet=4,
  relax=4, romantic=4, fullDay=4)
c("立川", "昭和記念公園と大型商業施設で一日遊べる",
  shopping=5, nature=4, entertainment=4, gourmet=4, indoor=4, rainyDay=4,
  outdoor=4, walk=4, fullDay=5)
c("町田", "買い物と飲食の選択肢が多く気軽に遊べる",
  shopping=5, gourmet=4, entertainment=4, drinking=4, indoor=4, rainyDay=4, shortStay=4)
c("八王子", "商業施設と飲み屋街があり一日過ごしやすい",
  shopping=4, gourmet=4, drinking=4, entertainment=3, indoor=4, rainyDay=4, shortStay=4)
c("調布", "映画館と深大寺方面の自然を組み合わせやすい",
  entertainment=4, shopping=4, gourmet=4, indoor=4, rainyDay=4, nature=3, walk=3, shortStay=4)
c("国分寺", "殿ヶ谷戸庭園の緑と駅前の飲食が揃う",
  nature=4, walk=4, gourmet=4, shopping=4, cafe=3, relax=4, indoor=3, shortStay=4)
c("国立", "大学通りの並木道と落ち着いたカフェ巡り",
  walk=5, scenery=5, cafe=5, romantic=4, gourmet=4, nature=3, relax=4, shortStay=4)
c("府中", "大國魂神社と競馬場・商業施設が揃う",
  unique=4, shopping=4, entertainment=4, walk=4, gourmet=3, indoor=3, fullDay=4)
c("小田急多摩センター", "商業施設とサンリオピューロランドで遊べる",
  entertainment=5, shopping=4, indoor=5, rainyDay=5, unique=4, gourmet=3,
  walk=3, romantic=3, fullDay=4)
c("多摩動物公園", "広い園内で動物を見ながら一日歩ける",
  entertainment=5, nature=5, outdoor=5, walk=5, active=4, unique=4, romantic=3, fullDay=5)
c("高尾", "高尾山と温泉に出やすい自然の玄関口",
  nature=5, outdoor=4, walk=4, active=4, scenery=4, relax=3, fullDay=4)
c("高尾山口", "高尾山の登山とふもとの温泉を満喫できる",
  nature=5, outdoor=5, active=5, walk=5, scenery=5, relax=5, unique=4,
  romantic=4, gourmet=3, fullDay=5)
c("奥多摩", "渓谷と山、川遊びで自然を満喫できる",
  nature=5, outdoor=5, scenery=5, active=5, walk=5, relax=4, unique=4, romantic=3, fullDay=5)
c("羽田空港第3ターミナル", "展望デッキの飛行機と夜景、空港グルメが楽しい",
  scenery=5, nightView=5, unique=5, gourmet=4, shopping=4, indoor=5, rainyDay=5,
  romantic=4, entertainment=3, fullDay=4)
c("大井競馬場前", "ナイター競馬と屋台グルメが独特",
  entertainment=5, unique=5, nightView=4, gourmet=3, outdoor=4, lateNight=4, drinking=3, fullDay=3)
c("荒川遊園地前", "下町の小さな遊園地と都電の風景が楽しい",
  entertainment=4, unique=4, walk=4, outdoor=3, nature=3, relax=3, romantic=3)

# =====================================================================
# 東京 pr=2
# =====================================================================
c("両国", "相撲の街と江戸東京博物館周辺を楽しめる",
  unique=5, indoor=4, rainyDay=4, walk=4, gourmet=4, entertainment=3, scenery=3)
c("亀有", "こち亀の像を巡る商店街と公園の散策",
  unique=5, walk=4, gourmet=4, shopping=3, nature=3, drinking=3, shortStay=4)
c("井の頭公園", "池のボートと木立の散策がのんびり楽しめる",
  nature=5, walk=5, outdoor=5, scenery=5, relax=5, romantic=5, unique=3, fullDay=3)
c("代々木上原", "パン屋とカフェ、落ち着いた食事が魅力",
  cafe=5, gourmet=5, walk=4, romantic=4, relax=3, shortStay=4)
c("代々木公園", "広い芝生と並木道でのんびり過ごせる",
  nature=5, outdoor=5, walk=5, relax=5, scenery=4, romantic=4, active=3, cafe=3, fullDay=3)
c("北品川", "旧東海道の宿場の面影が残る街歩き",
  unique=5, walk=5, gourmet=3, cafe=3, scenery=3, shortStay=4)
c("十条", "揚げ物が名物の商店街を食べ歩ける",
  gourmet=5, unique=4, drinking=4, walk=4, shopping=3, shortStay=4)
c("千駄木", "谷根千の路地と個人店をのんびり巡れる",
  walk=5, unique=5, cafe=5, gourmet=4, shopping=3, relax=4, romantic=3, shortStay=4)
c("四ツ谷", "迎賓館と外濠沿いの散策に出やすい",
  walk=4, scenery=4, unique=3, gourmet=3, nature=3, shortStay=4)
c("多摩湖", "湖畔の景色とサイクリングが気持ちいい",
  nature=5, scenery=5, outdoor=5, walk=4, active=4, relax=4, romantic=4, fullDay=3)
c("大森海岸", "しながわ水族館と海辺の公園に出やすい",
  entertainment=4, indoor=4, rainyDay=4, walk=4, nature=3, outdoor=3, romantic=3)
c("天王洲アイル", "運河沿いのアートと倉庫街の散策が独特",
  unique=5, walk=5, scenery=4, cafe=4, nightView=4, romantic=4, gourmet=3, relax=3)
c("学芸大学", "商店街の個人店と落ち着いたカフェ巡り",
  gourmet=5, cafe=4, drinking=4, walk=4, shopping=3, shortStay=4)
c("平山城址公園", "丘の上の城址と雑木林の散策に向く",
  nature=5, walk=5, outdoor=4, scenery=4, relax=4, active=3, unique=3)
c("成城学園前", "邸宅街の並木と落ち着いたカフェが魅力",
  walk=5, scenery=4, cafe=4, romantic=4, relax=4, gourmet=3, shopping=3)
c("戸越公園", "小さな庭園と商店街を組み合わせて歩ける",
  nature=3, walk=4, relax=3, gourmet=3, shortStay=4)
c("戸越銀座", "長い商店街の食べ歩きが名物",
  gourmet=5, unique=5, walk=5, drinking=4, shopping=3, shortStay=4)
c("早稲田", "学生街の食堂と神社・古書店の街歩き",
  gourmet=4, walk=4, unique=4, cafe=3, drinking=4, shortStay=4)
c("昭島", "大型商業施設と屋内アウトドア施設で遊べる",
  shopping=5, entertainment=4, indoor=5, rainyDay=5, gourmet=3, active=3, fullDay=4)
c("月島", "もんじゃ横丁と路地の下町散策が楽しい",
  gourmet=5, unique=5, walk=4, drinking=4, scenery=3, shortStay=4)
c("松陰神社前", "神社と世田谷線沿いの個人店巡りが楽しい",
  unique=4, walk=4, cafe=4, gourmet=4, shopping=3, relax=3, shortStay=4)
c("柴又", "帝釈天の参道と江戸川の土手を歩ける",
  unique=5, walk=5, gourmet=4, scenery=4, outdoor=4, nature=3, relax=4, romantic=3)
c("根津", "谷根千の落ち着いた路地とカフェ巡り",
  walk=5, unique=5, cafe=5, gourmet=4, relax=4, romantic=3, shortStay=4)
c("武蔵五日市", "秋川渓谷の川遊びとハイキングを楽しめる",
  nature=5, outdoor=5, scenery=5, active=5, walk=5, relax=4, unique=4, romantic=3, fullDay=5)
c("武蔵小山", "屋根付きの長い商店街で食べ歩きできる",
  gourmet=5, unique=5, shopping=4, walk=5, drinking=4, indoor=4, rainyDay=4, shortStay=4)
c("江古田", "学生街の安い飲食店とライブハウスが楽しい",
  gourmet=4, drinking=4, cafe=3, unique=3, entertainment=3, walk=3, shortStay=4)
c("池上", "池上本門寺の石段と門前町の散策",
  unique=5, walk=5, gourmet=4, relax=4, scenery=3, nature=3, shortStay=4)
c("清澄白河", "コーヒーの街と清澄庭園の落ち着いた散歩",
  cafe=5, unique=5, walk=5, nature=4, relax=5, romantic=4, gourmet=3, indoor=3)
c("王子", "飛鳥山の桜と都電・音無川の散策が楽しい",
  nature=4, walk=5, unique=4, scenery=4, outdoor=4, relax=3, indoor=3, romantic=3)
c("白金台", "庭園美術館と邸宅街の落ち着いた街歩き",
  unique=4, walk=4, nature=4, cafe=4, indoor=4, rainyDay=4, relax=4, romantic=4, scenery=3)
c("石神井公園", "二つの池を巡る広い公園でのんびりできる",
  nature=5, outdoor=5, walk=5, scenery=4, relax=5, romantic=4, gourmet=3, fullDay=3)
c("祐天寺", "落ち着いた住宅街の個人店とカフェ巡り",
  cafe=4, gourmet=4, walk=4, relax=3, shortStay=4)
c("神楽坂", "石畳の路地と隠れ家的な食事を楽しめる",
  gourmet=5, cafe=4, walk=5, unique=5, romantic=5, drinking=4, scenery=3, shortStay=4)
c("福生", "米軍基地沿いのアメリカンな街並みが独特",
  unique=5, gourmet=4, drinking=4, shopping=4, walk=4, cafe=3, shortStay=4)
c("等々力", "等々力渓谷の緑と川沿いの遊歩道が涼しい",
  nature=5, walk=5, scenery=4, outdoor=4, relax=5, unique=5, romantic=4)
c("経堂", "商店街の個人店とカフェを気軽に巡れる",
  gourmet=4, cafe=4, drinking=4, walk=4, shopping=3, shortStay=4)
c("練馬", "映画館と光が丘公園方面を組み合わせやすい",
  entertainment=4, indoor=4, rainyDay=4, gourmet=3, nature=3, walk=3, shortStay=4)
c("聖蹟桜ヶ丘", "丘の上からの眺めと多摩川沿いの散策",
  scenery=5, walk=5, nature=4, shopping=4, unique=4, nightView=4, outdoor=4, romantic=4)
c("舎人公園", "広い芝生と池、遊具でのんびり過ごせる",
  nature=5, outdoor=5, walk=4, relax=4, active=4, scenery=3, romantic=3, fullDay=3)
c("芝公園", "東京タワーを間近に望む芝生の公園",
  scenery=5, nightView=5, nature=4, walk=4, outdoor=4, relax=4, romantic=5, unique=3)
c("芦花公園", "徳冨蘆花ゆかりの静かな庭園を散策できる",
  nature=4, walk=4, relax=5, unique=3, scenery=3, outdoor=3)
c("蔵前", "職人の店とコーヒー、隅田川沿いの散歩",
  cafe=5, unique=5, shopping=4, walk=5, gourmet=4, scenery=3, romantic=4, shortStay=4)
c("西荻窪", "古道具屋と個人店を掘るのが楽しい街",
  unique=5, cafe=5, shopping=4, gourmet=5, drinking=5, walk=4, shortStay=4)
c("見沼代親水公園", "水路沿いの遊歩道を静かに歩ける",
  nature=4, walk=4, relax=4, outdoor=3, scenery=3)
c("豪徳寺", "招き猫の寺と世田谷線沿いの落ち着いた散歩",
  unique=5, walk=4, relax=4, cafe=3, gourmet=3, scenery=3, shortStay=4)
c("門前仲町", "深川不動と昔ながらの飲み屋街が楽しい",
  drinking=5, gourmet=5, unique=5, walk=4, lateNight=4, relax=3, shortStay=4)
c("阿佐ケ谷", "老舗喫茶と商店街、飲み屋横丁が楽しい",
  drinking=5, gourmet=4, cafe=4, unique=4, walk=4, shopping=3, lateNight=4, shortStay=4)
c("青梅", "レトロな看板の街並みと多摩川の自然",
  unique=5, walk=4, nature=4, scenery=3, cafe=3, outdoor=3, relax=3)
c("駒沢大学", "駒沢公園のランニングとカフェを組み合わせやすい",
  nature=4, outdoor=4, walk=4, active=5, cafe=4, relax=4, romantic=3, fullDay=3)
c("高幡不動", "高幡不動尊とあじさいの参道を歩ける",
  unique=5, walk=4, relax=4, nature=3, gourmet=3, scenery=3, shortStay=4)
c("高田馬場", "学生街の安い飲食店と居酒屋が充実",
  drinking=5, gourmet=5, entertainment=3, lateNight=5, walk=3, shortStay=4)

# =====================================================================
# 神奈川 pr=1
# =====================================================================
c("横浜", "買い物・食事・観光までひと通り揃う大都市",
  shopping=5, gourmet=5, entertainment=4, cafe=4, drinking=4, indoor=5, rainyDay=5,
  lateNight=4, fullDay=4, shortStay=4)
c("みなとみらい", "海辺の夜景と大型商業施設の王道デート",
  nightView=5, scenery=5, shopping=5, romantic=5, walk=5, entertainment=4,
  indoor=4, rainyDay=4, cafe=4, gourmet=4, outdoor=4, fullDay=5)
c("桜木町", "みなとみらいの夜景と野毛の酒場が両方楽しめる",
  nightView=5, scenery=4, drinking=5, gourmet=4, walk=5, romantic=4,
  unique=4, lateNight=5, fullDay=4)
c("関内", "野毛の飲み歩きと横浜スタジアム周辺を楽しめる",
  drinking=5, gourmet=4, entertainment=4, walk=4, unique=4, lateNight=4, shortStay=4)
c("元町・中華街", "中華街の食べ歩きと元町・山下公園を楽しめる",
  gourmet=5, unique=5, shopping=5, walk=5, scenery=4, cafe=4, outdoor=4,
  romantic=5, nightView=4, fullDay=5)
c("日本大通り", "歴史的建造物と山下公園の海辺散策",
  scenery=5, walk=5, unique=5, nature=3, outdoor=4, romantic=5, cafe=4, relax=4, nightView=4)
c("馬車道", "赤レンガ倉庫と歴史ある街並みを歩ける",
  unique=5, walk=5, scenery=5, shopping=4, cafe=4, romantic=5, nightView=4, gourmet=4)
c("石川町", "中華街と山手の洋館・坂道をまとめて歩ける",
  gourmet=5, unique=5, walk=5, scenery=4, cafe=4, romantic=4, fullDay=4)
c("川崎", "映画・買い物・飲食がまとまり一日遊べる",
  shopping=5, entertainment=5, gourmet=4, drinking=4, indoor=5, rainyDay=5,
  lateNight=4, fullDay=4, shortStay=4)
c("京急川崎", "川崎の商業施設と飲食に出やすい",
  shopping=4, entertainment=4, gourmet=4, drinking=4, indoor=4, rainyDay=4, shortStay=4)
c("武蔵小杉", "商業施設と多摩川の河川敷を組み合わせやすい",
  shopping=5, gourmet=4, indoor=4, rainyDay=4, walk=4, outdoor=3, nature=3, shortStay=4)
c("溝の口", "気取らない飲食店街と商業施設が揃う",
  drinking=4, gourmet=4, shopping=4, indoor=4, rainyDay=4, entertainment=3, shortStay=4)
c("新横浜", "ラーメン博物館とイベント会場が楽しめる",
  gourmet=5, unique=4, entertainment=4, indoor=4, rainyDay=4, shopping=3, shortStay=4)
c("たまプラーザ", "落ち着いた商業施設とカフェをゆったり巡れる",
  shopping=4, cafe=4, gourmet=4, walk=4, relax=4, indoor=4, rainyDay=4, romantic=3)
c("センター北", "商業施設と公園がまとまり家族でも遊べる",
  shopping=5, entertainment=4, indoor=4, rainyDay=4, nature=3, walk=4, gourmet=3, fullDay=4)
c("センター南", "商業施設と緑道の散策を組み合わせやすい",
  shopping=5, gourmet=4, indoor=4, rainyDay=4, walk=4, nature=3, fullDay=4)
c("本厚木", "飲食店が多く気軽に飲んで過ごせる",
  drinking=5, gourmet=4, shopping=4, indoor=3, lateNight=4, shortStay=4)
c("海老名", "大型商業施設と映画で一日過ごせる",
  shopping=5, entertainment=4, gourmet=4, indoor=5, rainyDay=5, fullDay=4, shortStay=4)
c("相模大野", "商業施設と映画館がまとまっている",
  shopping=4, entertainment=4, gourmet=4, indoor=4, rainyDay=4, shortStay=4)
c("橋本", "商業施設と映画がコンパクトに揃う",
  shopping=4, entertainment=4, gourmet=3, indoor=4, rainyDay=4, shortStay=4)
c("鎌倉", "寺社と小町通りの食べ歩き、王道の鎌倉散策",
  unique=5, walk=5, gourmet=5, scenery=4, cafe=4, shopping=4, nature=4,
  romantic=5, relax=4, outdoor=4, fullDay=5)
c("北鎌倉", "円覚寺・建長寺と静かな緑の参道を歩ける",
  unique=5, nature=5, walk=5, relax=5, scenery=4, romantic=4, cafe=3, outdoor=4)
c("長谷", "鎌倉大仏と長谷寺、海までの散策が楽しめる",
  unique=5, walk=5, scenery=4, nature=4, romantic=4, gourmet=3, cafe=3, outdoor=4, fullDay=4)
c("由比ヶ浜", "静かな砂浜と鎌倉散策を組み合わせやすい",
  scenery=5, outdoor=5, walk=4, nature=4, relax=5, romantic=5, active=3)
c("湘南江の島", "江の島の観光と海辺の食べ歩きが楽しい",
  scenery=5, outdoor=5, walk=5, gourmet=4, unique=4, nature=4, romantic=5,
  relax=4, active=3, fullDay=4)
c("片瀬江ノ島", "江の島と水族館、海辺の散歩を楽しめる",
  scenery=5, outdoor=5, entertainment=4, walk=5, gourmet=4, unique=5, nature=4,
  romantic=5, indoor=3, fullDay=5)
c("藤沢", "江の島方面の玄関口で買い物と食事も揃う",
  shopping=4, gourmet=4, drinking=4, indoor=4, rainyDay=4, shortStay=4)
c("逗子", "静かな海とカフェをのんびり楽しめる",
  scenery=4, outdoor=4, cafe=4, walk=4, relax=5, nature=3, romantic=4, gourmet=3)
c("逗子・葉山", "葉山方面の海と落ち着いた街歩きの拠点",
  scenery=4, outdoor=4, walk=4, relax=5, cafe=3, romantic=4, nature=3)
c("横須賀中央", "商店街と海軍カレーなど独特のグルメが楽しい",
  gourmet=4, unique=5, shopping=3, walk=4, drinking=4, shortStay=4)
c("汐入", "軍港めぐりと海沿いの商業施設を楽しめる",
  unique=5, scenery=4, shopping=4, walk=4, entertainment=3, gourmet=3, outdoor=3)
c("小田原", "小田原城と港の海鮮、街歩きをまとめて楽しめる",
  unique=5, walk=5, gourmet=5, scenery=4, nature=3, shopping=3, outdoor=3, fullDay=4)

# =====================================================================
# 神奈川 pr=2
# =====================================================================
c("七里ヶ浜", "海沿いのカフェから夕日と江の島を眺められる",
  scenery=5, outdoor=5, cafe=5, romantic=5, relax=5, walk=4, nature=3, nightView=3)
c("稲村ヶ崎", "岬から江の島と富士山を望む夕景が名物",
  scenery=5, outdoor=4, romantic=5, relax=4, walk=4, nature=3, unique=3)
c("鎌倉高校前", "踏切越しの海と江ノ電の景色で知られる",
  scenery=5, unique=5, romantic=5, outdoor=4, walk=3, relax=3)
c("極楽寺", "江ノ電沿いの静かな寺と落ち着いた路地",
  unique=5, walk=4, relax=5, nature=3, scenery=3, cafe=3)
c("鵠沼海岸", "サーファーの多い砂浜と海辺の散歩",
  scenery=4, outdoor=5, active=4, relax=4, walk=4, romantic=4, cafe=3)
c("湘南海岸公園", "海沿いの公園と砂浜の散策が気持ちいい",
  scenery=4, outdoor=5, walk=4, relax=4, nature=3, romantic=4, active=3)
c("茅ケ崎", "サザンゆかりの街と海辺の散策が楽しめる",
  unique=4, scenery=4, outdoor=4, gourmet=4, drinking=4, walk=4, relax=4, cafe=3)
c("辻堂", "大型商業施設と海辺の公園を組み合わせやすい",
  shopping=5, indoor=4, rainyDay=4, outdoor=4, nature=3, walk=4, gourmet=3, fullDay=4)
c("平塚", "商店街と海、大型商業施設が揃う",
  shopping=4, gourmet=4, drinking=4, outdoor=3, walk=4, shortStay=4)
c("大磯", "旧別荘地の静かな街並みと海辺の散歩",
  unique=4, scenery=4, walk=4, relax=5, outdoor=4, nature=3, romantic=4)
c("真鶴", "岬の原生林と静かな漁港の景色が魅力",
  scenery=5, nature=5, outdoor=4, relax=5, walk=4, unique=4, gourmet=3, romantic=3)
c("湯河原", "温泉街と渓谷の自然でのんびり過ごせる",
  relax=5, nature=4, unique=4, scenery=4, walk=4, outdoor=3, gourmet=3, romantic=4, fullDay=4)
c("鶴巻温泉", "日帰り温泉と丹沢方面の自然に出やすい",
  relax=5, nature=3, unique=3, outdoor=3, walk=3)
c("秦野", "丹沢の登山口と湧水の里を楽しめる",
  nature=5, outdoor=4, active=4, walk=4, scenery=4, relax=3)
c("伊勢原", "大山の登山とケーブルカーへの入口",
  nature=5, outdoor=4, active=4, unique=4, scenery=4, walk=3)
c("相模湖", "湖のボートとレジャー施設で遊べる",
  nature=5, outdoor=5, scenery=5, entertainment=4, active=4, relax=4, romantic=4, fullDay=4)
c("三崎口", "三崎のマグロと城ヶ島方面への玄関口",
  gourmet=5, unique=4, scenery=3, outdoor=3, nature=3)
c("三浦海岸", "広い砂浜と海沿いの景色を楽しめる",
  scenery=5, outdoor=5, nature=4, relax=4, walk=4, romantic=4, active=3)
c("久里浜", "ペリー公園とフェリー乗り場のある港町",
  scenery=4, outdoor=4, unique=4, walk=4, nature=3, relax=3)
c("浦賀", "ペリー来航の港町と渡し船の風景が独特",
  unique=5, scenery=4, walk=4, outdoor=3, relax=4, nature=3)
c("馬堀海岸", "ヤシ並木の海沿い遊歩道を歩ける",
  scenery=4, outdoor=4, walk=4, relax=4, romantic=3)
c("八景島", "水族館とアトラクションで一日遊べる",
  entertainment=5, scenery=4, outdoor=4, unique=4, walk=4, romantic=4,
  indoor=4, rainyDay=4, active=3, fullDay=5)
c("海の公園南口", "人工の砂浜で潮干狩りや海遊びができる",
  outdoor=5, scenery=4, nature=4, relax=4, active=4, walk=4, romantic=3)
c("海の公園柴口", "砂浜沿いの公園でのんびり過ごせる",
  outdoor=5, scenery=4, nature=4, relax=4, walk=4, active=3)
c("野島公園", "小さな展望台と海辺の公園を楽しめる",
  outdoor=4, scenery=4, nature=4, walk=4, relax=4, unique=3)
c("金沢八景", "海辺と八景島方面への玄関口として使える",
  scenery=3, outdoor=3, walk=3, shortStay=4)
c("金沢文庫", "称名寺の庭園と落ち着いた散策が魅力",
  unique=4, nature=4, walk=4, relax=5, scenery=3)
c("上大岡", "映画と買い物がひとまとまりで便利",
  shopping=5, entertainment=4, gourmet=4, indoor=4, rainyDay=4, shortStay=4)
c("戸塚", "商業施設と柏尾川沿いの散歩を楽しめる",
  shopping=4, gourmet=3, indoor=4, rainyDay=4, walk=4, shortStay=4)
c("東戸塚", "大型商業施設中心にゆったり過ごせる",
  shopping=5, gourmet=4, indoor=5, rainyDay=5, cafe=3, fullDay=4)
c("大船", "活気ある商店街と鎌倉方面への拠点",
  gourmet=4, drinking=4, shopping=4, walk=4, unique=3, shortStay=4)
c("湘南台", "商業施設と落ち着いた街歩きに向く",
  shopping=4, gourmet=4, indoor=3, walk=3, shortStay=4)
c("中央林間", "落ち着いたカフェと郊外の散歩に向く",
  cafe=4, gourmet=3, shopping=3, walk=3, relax=3, shortStay=4)
c("大和", "商業施設と引地川沿いの緑を組み合わせやすい",
  shopping=4, gourmet=3, indoor=3, walk=3, nature=3, shortStay=4)
c("青葉台", "落ち着いた商業施設とカフェが揃う",
  shopping=4, cafe=4, gourmet=4, indoor=3, walk=3, relax=3, shortStay=4)
c("新百合ヶ丘", "映画と商業施設で落ち着いて過ごせる",
  entertainment=4, shopping=4, indoor=4, rainyDay=4, cafe=3, gourmet=3, shortStay=4)
c("向ヶ丘遊園", "生田緑地とミュージアムで一日過ごせる",
  nature=5, outdoor=4, walk=5, entertainment=4, indoor=4, rainyDay=4,
  unique=4, relax=4, romantic=3, fullDay=4)
c("登戸", "多摩川の河川敷とミュージアム方面に出やすい",
  outdoor=4, walk=4, nature=3, entertainment=3, scenery=3)
c("二子新地", "多摩川の河川敷で気軽にのんびりできる",
  outdoor=4, walk=4, scenery=4, nature=3, relax=4, romantic=3)
c("新丸子", "小さな商店街と多摩川の散歩が楽しめる",
  gourmet=4, drinking=4, walk=4, outdoor=3, shortStay=4)
c("元住吉", "長い商店街の食べ歩きが楽しい",
  gourmet=5, unique=4, drinking=4, walk=4, cafe=3, shopping=3, shortStay=4)
c("日吉", "学生街の商店街とカフェが気軽に楽しめる",
  gourmet=4, cafe=4, drinking=4, walk=3, shortStay=4)
c("綱島", "商店街と鶴見川沿いの散歩を組み合わせやすい",
  gourmet=4, drinking=4, walk=4, relax=3, outdoor=3, shortStay=4)
c("大倉山", "梅林の公園と落ち着いた商店街の散歩",
  nature=4, walk=4, unique=4, relax=4, cafe=3, scenery=3)
c("武蔵新城", "個人店の多い商店街を開拓するのが楽しい",
  gourmet=5, drinking=4, unique=4, walk=4, shortStay=4)
c("鶴見", "總持寺の広い境内と商店街を歩ける",
  unique=4, walk=4, gourmet=4, relax=4, drinking=3, nature=3, shortStay=4)
c("宮前平", "日帰り温泉と落ち着いた街歩きに向く",
  relax=5, walk=3, gourmet=3, indoor=3, rainyDay=3)
c("宮崎台", "電車とバスの博物館で雨でも楽しめる",
  entertainment=4, indoor=5, rainyDay=5, unique=4, walk=3)
c("岸根公園", "竹林と広場のある落ち着いた公園",
  nature=4, outdoor=4, walk=4, relax=4, active=3, scenery=3)
c("山手", "洋館と坂道、港の見える丘公園を巡れる",
  unique=5, walk=5, scenery=5, nature=4, romantic=5, relax=4, cafe=4, outdoor=4, fullDay=4)
c("公園上", "強羅公園の上入口。箱根の庭園と山の景色を楽しめる",
  nature=4, unique=4, scenery=4, walk=4, relax=4, outdoor=3, romantic=3)
c("公園下", "強羅公園の下入口。箱根の庭園散策に便利",
  nature=4, unique=4, scenery=4, walk=4, relax=4, outdoor=3, romantic=3)

# =====================================================================
# 埼玉
# =====================================================================
c("大宮(埼玉)", "大型商業施設と鉄道スポット、飲み屋街が揃う",
  shopping=5, gourmet=4, drinking=5, entertainment=4, indoor=4, rainyDay=4,
  unique=3, lateNight=4, fullDay=4, shortStay=4)
c("さいたま新都心", "大型商業施設とイベント会場がまとまる",
  shopping=5, entertainment=4, gourmet=4, indoor=5, rainyDay=5, walk=3, fullDay=4)
c("浦和", "落ち着いた商業施設とカフェ・飲食が揃う",
  shopping=4, cafe=4, gourmet=4, drinking=4, indoor=4, rainyDay=4, shortStay=4)
c("川口", "商業施設と気軽な飲食で過ごしやすい",
  shopping=4, gourmet=4, drinking=4, indoor=4, rainyDay=4, shortStay=4)
c("川越", "蔵造りの町並みと食べ歩き、寺社巡りが楽しい",
  unique=5, walk=5, gourmet=5, scenery=5, shopping=4, cafe=4, romantic=4,
  outdoor=3, relax=3, fullDay=5)
c("本川越", "小江戸川越の街歩きと食べ歩きに便利",
  unique=5, walk=5, gourmet=5, scenery=4, shopping=4, cafe=4, romantic=4, fullDay=4)
c("所沢", "商業施設と航空公園方面を組み合わせやすい",
  shopping=4, gourmet=4, indoor=4, rainyDay=4, nature=3, walk=3, shortStay=4)
c("越谷レイクタウン", "日本最大級のモールで一日買い物を楽しめる",
  shopping=5, gourmet=4, entertainment=4, indoor=5, rainyDay=5, cafe=4,
  walk=4, fullDay=5)
c("西武園ゆうえんち", "昭和の街並みを再現した遊園地で遊べる",
  entertainment=5, unique=5, active=4, outdoor=4, romantic=3, fullDay=5, nightView=3)
c("鉄道博物館", "実物の車両と運転体験で一日楽しめる",
  entertainment=5, indoor=5, rainyDay=5, unique=5, active=3, fullDay=5)
c("秩父", "秩父神社と街歩き、山の景色を楽しめる",
  unique=5, nature=4, walk=4, gourmet=4, scenery=4, outdoor=3, relax=3, fullDay=4)
c("西武秩父", "秩父観光の拠点で日帰り温泉とグルメが揃う",
  relax=5, unique=4, gourmet=4, nature=4, shopping=3, scenery=3, walk=3, fullDay=4)
c("長瀞", "ライン下りと岩畳の渓谷美を楽しめる",
  nature=5, outdoor=5, scenery=5, unique=5, active=4, walk=4, relax=4,
  romantic=4, fullDay=4)
c("高麗", "巾着田の曼珠沙華と日和田山の自然が名物",
  nature=5, outdoor=5, scenery=5, walk=5, unique=4, active=4, relax=4, romantic=3)
c("飯能", "ムーミンのテーマパークと里山の自然が楽しめる",
  nature=4, outdoor=4, unique=5, entertainment=4, walk=4, romantic=4, relax=4, fullDay=4)
c("東飯能", "飯能の自然と街歩きへの拠点にしやすい",
  nature=3, walk=3, gourmet=3, shortStay=4)
c("入間市", "アウトレットと航空公園方面へ出やすい",
  shopping=4, indoor=3, gourmet=3, walk=3, shortStay=4)
c("狭山市", "入間川の河川敷と落ち着いた街歩きに向く",
  outdoor=3, walk=3, nature=3, gourmet=3)
c("東松山", "こども動物自然公園と焼きとんが名物",
  entertainment=4, nature=4, gourmet=4, outdoor=4, walk=3, unique=4, drinking=3, fullDay=3)
c("熊谷", "荒川の河川敷と気軽な飲食を組み合わせやすい",
  outdoor=4, walk=4, gourmet=4, drinking=4, nature=3, shortStay=4)
c("深谷", "東京駅を模した駅舎とレトロな街並みが独特",
  unique=5, walk=4, scenery=4, gourmet=3, cafe=3, shortStay=4)
c("春日部", "クレヨンしんちゃんゆかりの街と商業施設",
  unique=4, shopping=4, gourmet=3, indoor=3, walk=3, shortStay=4)
c("草加", "草加松原の松並木と煎餅の食べ歩き",
  unique=5, walk=5, scenery=4, gourmet=4, nature=3, relax=3, outdoor=3)
c("越谷", "元荒川沿いの散策と気軽な飲食が揃う",
  walk=4, gourmet=4, drinking=3, nature=3, shortStay=4)
c("北越谷", "元荒川の桜並木と河川敷の散策が気持ちいい",
  scenery=4, walk=4, outdoor=4, nature=4, relax=4, romantic=3)
c("南越谷", "飲食店が多く気軽に飲んで過ごせる",
  drinking=4, gourmet=4, shopping=3, lateNight=3, shortStay=4)
c("新越谷", "商業施設と飲食で気軽に過ごせる",
  shopping=4, gourmet=4, drinking=4, indoor=3, shortStay=4)
c("武蔵浦和", "商業施設と別所沼方面の緑を組み合わせやすい",
  shopping=4, gourmet=3, indoor=3, walk=3, nature=3, shortStay=4)
c("和光市", "商業施設と和光樹林公園の緑が近い",
  shopping=3, nature=3, walk=3, gourmet=3, shortStay=4)
c("朝霞", "黒目川沿いの散歩と落ち着いた飲食が楽しめる",
  walk=4, nature=3, cafe=3, gourmet=3, relax=3)
c("志木", "柳瀬川沿いの散策と商業施設が揃う",
  walk=4, shopping=3, cafe=3, gourmet=3, nature=3, shortStay=4)
c("戸田公園", "荒川のボートコースと河川敷の散策",
  outdoor=4, walk=4, active=4, nature=3, scenery=3, relax=3)
c("蕨", "コンパクトな街並みと気軽な飲食が楽しめる",
  gourmet=4, drinking=4, walk=3, shortStay=4)

# =====================================================================
# 千葉
# =====================================================================
c("舞浜", "ディズニーリゾートで一日たっぷり遊べる",
  entertainment=5, unique=5, romantic=5, shopping=4, gourmet=4, walk=4,
  nightView=4, indoor=3, outdoor=4, fullDay=5)
c("東京ディズニーランド・ステーション", "ディズニーランドの目の前で一日遊べる",
  entertainment=5, unique=5, romantic=5, shopping=4, gourmet=4, nightView=4,
  walk=4, outdoor=4, fullDay=5)
c("東京ディズニーシー・ステーション", "ディズニーシーの目の前で一日遊べる",
  entertainment=5, unique=5, romantic=5, shopping=4, gourmet=4, nightView=4,
  walk=4, outdoor=4, fullDay=5)
c("ベイサイド・ステーション", "リゾートホテルが並ぶ湾岸エリアを楽しめる",
  unique=4, scenery=4, romantic=4, relax=4, shopping=3, walk=3, nightView=3)
c("リゾートゲートウェイ・ステーション", "ディズニーリゾートを巡る玄関口",
  entertainment=4, unique=4, romantic=4, shopping=3, walk=3)
c("浦安(千葉)", "境川沿いの旧市街と湾岸エリアへ出やすい",
  walk=4, unique=3, gourmet=3, scenery=3, shortStay=4)
c("新浦安", "リゾート感のある街並みと海辺の公園",
  scenery=4, walk=4, shopping=4, outdoor=4, relax=4, romantic=4, cafe=3, nature=3)
c("海浜幕張", "大型施設と海浜公園、イベントで一日遊べる",
  shopping=5, entertainment=4, outdoor=4, nature=4, walk=4, scenery=4,
  indoor=4, rainyDay=4, fullDay=5)
c("稲毛海岸", "人工海浜と公園でのんびり海辺を歩ける",
  outdoor=4, scenery=4, walk=4, nature=3, relax=4, romantic=3)
c("検見川浜", "ヨットハーバーと海辺の公園を楽しめる",
  outdoor=4, scenery=4, walk=4, relax=4, active=3, nature=3)
c("千葉みなと", "港の遊覧船とポートタワーの景色を楽しめる",
  scenery=5, nightView=4, walk=4, outdoor=4, unique=4, romantic=4, relax=3)
c("千葉", "商業施設と千葉公園を組み合わせて過ごせる",
  shopping=5, gourmet=4, drinking=4, entertainment=3, indoor=4, rainyDay=4,
  nature=3, walk=3, shortStay=4)
c("京成千葉", "千葉の商業施設と飲食に出やすい",
  shopping=4, gourmet=4, indoor=4, rainyDay=4, drinking=3, shortStay=4)
c("船橋", "商業施設と飲み屋街、周辺レジャーが揃う",
  shopping=4, gourmet=4, drinking=5, indoor=4, rainyDay=4, lateNight=4, shortStay=4)
c("京成船橋", "船橋の商業施設と飲食に出やすい",
  shopping=4, gourmet=4, drinking=4, indoor=3, shortStay=4)
c("西船橋", "飲食店が多く各方面への乗り換えにも便利",
  drinking=4, gourmet=4, lateNight=4, shortStay=4)
c("津田沼", "商業施設と飲食がコンパクトに揃う",
  shopping=5, gourmet=4, indoor=4, rainyDay=4, cafe=3, shortStay=4)
c("京成津田沼", "津田沼の商業施設と飲食に出やすい",
  shopping=3, gourmet=3, shortStay=4)
c("本八幡", "気軽な飲食店と商業施設が揃う",
  gourmet=4, drinking=4, shopping=3, indoor=3, shortStay=4)
c("市川", "江戸川の土手と落ち着いた街歩きを楽しめる",
  walk=4, outdoor=3, gourmet=3, nature=3, shortStay=4)
c("松戸", "商業施設と江戸川沿いの散策を組み合わせやすい",
  shopping=3, gourmet=4, drinking=4, walk=3, outdoor=3, shortStay=4)
c("新松戸", "気軽な飲食で立ち寄りやすい",
  gourmet=3, drinking=3, shortStay=4)
c("柏", "商業施設とカフェ、若者向けの街歩きが充実",
  shopping=5, cafe=4, gourmet=4, drinking=4, indoor=4, rainyDay=4, shortStay=4)
c("南流山", "気軽な飲食と各方面への乗り換えに便利",
  gourmet=3, drinking=3, shortStay=4)
c("流山", "みりんの蔵造りと江戸川沿いの街並みが残る",
  unique=4, walk=4, scenery=3, cafe=3, relax=3)
c("流山おおたかの森", "大型商業施設と新しい街並みを楽しめる",
  shopping=5, cafe=4, gourmet=4, indoor=4, rainyDay=4, walk=3, fullDay=4)
c("新鎌ヶ谷", "商業施設で気軽に買い物と食事ができる",
  shopping=4, gourmet=3, indoor=3, shortStay=4)
c("八千代緑が丘", "大型商業施設を中心に気軽に過ごせる",
  shopping=4, gourmet=3, indoor=4, rainyDay=4, shortStay=4)
c("勝田台", "気軽な飲食と落ち着いた街歩きに向く",
  gourmet=3, drinking=3, walk=3, shortStay=4)
c("東葉勝田台", "気軽な飲食で立ち寄りやすい",
  gourmet=3, drinking=3, shortStay=4)
c("ちはら台", "商業施設と公園でのんびり過ごせる",
  shopping=3, nature=3, walk=3, relax=3)
c("印西牧の原", "大型商業施設と広々した街並みが特徴",
  shopping=5, gourmet=3, indoor=4, rainyDay=4, entertainment=3, fullDay=4)
c("公津の杜", "商業施設とカフェで落ち着いて過ごせる",
  shopping=3, cafe=3, gourmet=3, walk=3)
c("成田", "成田山の参道でうなぎと食べ歩きを楽しめる",
  unique=5, walk=5, gourmet=5, scenery=4, nature=3, relax=4, shopping=3,
  outdoor=3, romantic=3, fullDay=4)
c("京成成田", "成田山の参道散策と食べ歩きに便利",
  unique=5, walk=5, gourmet=5, scenery=3, relax=4, shopping=3, fullDay=4)
c("成田湯川", "成田周辺の自然と観光への拠点にしやすい",
  nature=3, walk=3)
c("成田空港（成田第１ターミナル）", "展望デッキの飛行機と空港グルメを楽しめる",
  unique=5, scenery=4, shopping=4, gourmet=4, indoor=5, rainyDay=5, entertainment=3, fullDay=3)
c("空港第２ビル（成田第２・第３ターミナル）", "飛行機の展望と空港のショップを楽しめる",
  unique=5, scenery=4, shopping=4, gourmet=4, indoor=5, rainyDay=5, fullDay=3)
c("佐原", "小江戸の川沿いの町並みと舟めぐりが楽しい",
  unique=5, walk=5, scenery=5, relax=4, romantic=4, gourmet=4, cafe=3,
  nature=3, outdoor=3, fullDay=4)
c("銚子", "海鮮と港町散策、銚子電鉄の旅が楽しめる",
  gourmet=5, unique=5, scenery=4, walk=4, outdoor=3, nature=3, fullDay=4)
c("犬吠", "犬吠埼灯台と太平洋の絶景を楽しめる",
  scenery=5, unique=5, outdoor=5, nature=4, walk=4, romantic=5, relax=4, fullDay=3)
c("木更津", "海に伸びる桟橋と港のグルメを楽しめる",
  scenery=4, unique=4, gourmet=4, outdoor=4, walk=4, romantic=4, shopping=3, relax=3)
c("袖ヶ浦", "海沿いのレジャー施設への拠点にしやすい",
  outdoor=3, scenery=3, walk=3)
c("館山", "南房総の海と花畑、海鮮グルメが楽しめる",
  scenery=5, outdoor=5, nature=4, gourmet=4, relax=5, walk=4, romantic=4,
  unique=4, active=3, fullDay=4)

# =====================================================================
# 「5」＝長押し（★最優先）で残る"代表格"のホワイトリスト
#   5 は「この気分ならここだよね」と言える駅だけ。
#   例) デートっぽさ: お台場・みなとみらい=5 / 川崎はデートもできるが
#       the デートではないので 4。
#   ここに無い駅が 5 を持っていたら 4 に落とす（＝タップでは残る）。
# =====================================================================
FIVES = {
 "drinking": """新宿 新宿三丁目 北千住 赤羽 高円寺 中野 三軒茶屋 下北沢 大井町 五反田 蒲田
   門前仲町 高田馬場 西荻窪 阿佐ケ谷 六本木 恵比寿 川崎 桜木町 関内 日ノ出町 京成立石
   大宮(埼玉) 船橋 本厚木""",

 "gourmet": """元町・中華街 石川町 月島 戸越銀座 武蔵小山 十条 蒲田 赤羽 三崎口 銚子 豊洲
   築地市場 市場前 銀座 浅草 神保町 川越 本川越 成田 京成成田 小田原 早川 保田(千葉)
   阪東橋 弘明寺""",

 "cafe": """下北沢 中目黒 代々木上原 代官山 千駄木 国立 根津 清澄白河 神保町 自由が丘 蔵前
   表参道 西荻窪 銀座 七里ヶ浜 仙川 広尾""",

 "shopping": """新宿 新宿三丁目 渋谷 池袋 銀座 東京 横浜 表参道 明治神宮前〈原宿〉 自由が丘
   下北沢 高円寺 秋葉原 二子玉川 台場 とうきょうスカイツリー 立川 町田 大宮(埼玉)
   越谷レイクタウン 海浜幕張 代官山 吉祥寺""",

 "entertainment": """とうきょうスカイツリー 上野 台場 多摩動物公園 大井競馬場前 小田急多摩センター
   有明 池袋 渋谷 秋葉原 葛西臨海公園 八景島 川崎 舞浜 西武園ゆうえんち 鉄道博物館
   東京ディズニーランド・ステーション 東京ディズニーシー・ステーション 清水公園 こどもの国
   京王よみうりランド 東武動物公園 相模湖""",

 "nature": """奥多摩 高尾山口 高尾 井の頭公園 代々木公園 石神井公園 等々力 多摩湖 多摩動物公園
   武蔵五日市 平山城址公園 舎人公園 葛西臨海公園 相模湖 秦野 伊勢原 真鶴 北鎌倉 向ヶ丘遊園
   長瀞 高麗 養老渓谷 浜金谷 御嶽 大雄山 芦ヶ久保 三峰口 上総亀山""",

 "walk": """浅草 神保町 神楽坂 千駄木 根津 日暮里 下北沢 吉祥寺 銀座 表参道 川越 本川越 鎌倉
   北鎌倉 佐原 小田原 山手 元町・中華街 馬車道 日本大通り 戸越銀座 武蔵小山 柴又 蔵前
   清澄白河 国立 成田 京成成田 中目黒 自由が丘""",

 "scenery": """お台場海浜公園 とうきょうスカイツリー 羽田空港第3ターミナル 芝公園 高尾山口 奥多摩
   多摩湖 みなとみらい 七里ヶ浜 稲村ヶ崎 鎌倉高校前 由比ヶ浜 三浦海岸 真鶴 湘南江の島
   片瀬江ノ島 山手 日本大通り 犬吠 長瀞 館山 千葉みなと 相模湖 台場 海芝浦 根府川 君ヶ浜
   飯岡 浜金谷 二宮""",

 "nightView": """お台場海浜公園 とうきょうスカイツリー 六本木 台場 汐留 羽田空港第3ターミナル
   芝公園 みなとみらい 桜木町 都庁前 赤羽橋 竹芝 芝浦ふ頭 東京テレポート 青海 テレコムセンター""",

 "relax": """井の頭公園 代々木公園 清澄白河 石神井公園 等々力 芦花公園 高尾山口 七里ヶ浜 北鎌倉
   大磯 宮前平 極楽寺 湯河原 由比ヶ浜 真鶴 逗子 逗子・葉山 金沢文庫 鶴巻温泉 館山 西武秩父
   箱根湯本 強羅 宮ノ下 大平台 塔ノ沢 小涌谷 沢井""",

 "active": """奥多摩 武蔵五日市 駒沢大学 高尾山口 高尾 相模湖 長瀞 秦野 伊勢原 三浦海岸 鵠沼海岸
   海の公園南口 多摩動物公園 清水公園 浜金谷 上総一ノ宮 東浪見 御嶽 大雄山 芦ヶ久保""",

 "romantic": """お台場海浜公園 台場 みなとみらい 元町・中華街 山手 日本大通り 馬車道 鎌倉 湘南江の島
   片瀬江ノ島 七里ヶ浜 稲村ヶ崎 由比ヶ浜 鎌倉高校前 舞浜 東京ディズニーランド・ステーション
   東京ディズニーシー・ステーション とうきょうスカイツリー 六本木 恵比寿 中目黒 代官山 自由が丘
   表参道 銀座 神楽坂 芝公園 井の頭公園 犬吠""",

 "unique": """大井競馬場前 天王洲アイル 福生 青梅 両国 亀有 豪徳寺 柴又 月島 北品川 深谷 鉄道博物館
   西武園ゆうえんち 銚子 犬吠 佐原 浦賀 汐入 横須賀中央 秋葉原 羽田空港第3ターミナル
   成田空港（成田第１ターミナル） 長瀞 川越 本川越 海芝浦 国道 飯給 鷲宮 生麦""",

 "rainyDay": """とうきょうスカイツリー 上野 品川 小田急多摩センター 昭島 東京 池袋
   羽田空港第3ターミナル 宮崎台 川崎 東戸塚 横浜 海老名 越谷レイクタウン さいたま新都心
   空港第２ビル（成田第２・第３ターミナル） 成田空港（成田第１ターミナル） 鉄道博物館
   幕張豊砂 新三郷 南大沢 印西牧の原""",

 "indoor": """とうきょうスカイツリー 上野 品川 小田急多摩センター 昭島 東京 池袋
   羽田空港第3ターミナル 宮崎台 川崎 東戸塚 横浜 海老名 越谷レイクタウン さいたま新都心
   空港第２ビル（成田第２・第３ターミナル） 成田空港（成田第１ターミナル） 鉄道博物館
   幕張豊砂 新三郷 南大沢 印西牧の原""",

 "outdoor": """お台場海浜公園 井の頭公園 代々木公園 多摩動物公園 多摩湖 奥多摩 武蔵五日市 石神井公園
   舎人公園 葛西臨海公園 高尾山口 七里ヶ浜 三浦海岸 海の公園南口 海の公園柴口 湘南江の島
   湘南海岸公園 片瀬江ノ島 由比ヶ浜 相模湖 鵠沼海岸 館山 高麗 長瀞 犬吠 浜金谷 御宿 君ヶ浜""",

 "lateNight": """六本木 新宿 新宿三丁目 渋谷 赤羽 高円寺 高田馬場 桜木町 川崎 北千住 錦糸町 上野
   大井町 三軒茶屋 中野 蒲田 関内 船橋 大宮(埼玉) 日ノ出町 京成立石""",

 "fullDay": """上野 台場 多摩動物公園 奥多摩 武蔵五日市 立川 葛西臨海公園 高尾山口 みなとみらい
   元町・中華街 八景島 片瀬江ノ島 鎌倉 越谷レイクタウン 川越 舞浜 海浜幕張 西武園ゆうえんち
   鉄道博物館 東京ディズニーランド・ステーション 東京ディズニーシー・ステーション 清水公園
   こどもの国 森林公園(埼玉)""",

 "shortStay": """戸越銀座 武蔵小山 十条 阿佐ケ谷 三軒茶屋 中目黒 学芸大学 経堂 祐天寺 元住吉
   武蔵新城 自由が丘 代官山 松陰神社前 豪徳寺 千駄木 根津 白楽 弘明寺 西小山 雑色""",
}

# 空白区切りの文字列を集合に変換
FIVES = {k: set(v.split()) for k, v in FIVES.items()}

# =====================================================================
# 「4」＝タップで残る"できる"層の下限保証
#   5(代表格)ではないが、その気分で十分に成立する駅。
#   例) 川崎はデートもできるが the デートではない → 4。
#   ここに載っている駅は、最低でも 4 になる（既に5ならそのまま）。
# =====================================================================
FOURS = {
 # 大きな街ならデートは成立する（ただし"the デート"ではないので5にはしない）
 "romantic": """新宿 新宿三丁目 渋谷 池袋 東京 横浜 川崎 京急川崎 上野 立川 町田 大宮(埼玉) 千葉
   柏 船橋 海浜幕張 越谷レイクタウン 錦糸町 品川 武蔵小杉 センター北 センター南 海老名 浦和
   有楽町 豊洲 有明 桜木町 関内 石川町 新浦安 流山おおたかの森 さいたま新都心 所沢 藤沢
   大船 上大岡 溝の口 たまプラーザ 青葉台 新百合ヶ丘 二子玉川 吉祥寺 国立 白金台 麻布十番
   目黒 天王洲アイル 池上 清澄白河 蔵前 王子 大磯 逗子 湘南海岸公園 鵠沼海岸 三浦海岸
   小田原 長谷 北鎌倉 川越 本川越 佐原 成田 京成成田 舞浜""",

 # 大きな街ならカフェは一通りある
 "cafe": """川崎 京急川崎 上野 立川 町田 大宮(埼玉) 千葉 船橋 北千住 品川 武蔵小杉 海老名 錦糸町
   センター北 センター南 東京 池袋 横浜 有楽町 新宿 新宿三丁目 渋谷 吉祥寺 二子玉川 恵比寿
   麻布十番 目黒 白金台 成城学園前 国立 たまプラーザ 青葉台 新百合ヶ丘 浦和 所沢 柏 津田沼
   流山おおたかの森 越谷レイクタウン 海浜幕張 鎌倉 北鎌倉 湘南江の島 逗子 大磯 川越 本川越 佐原""",

 # 繁華街なら夜まで飲める
 "lateNight": """池袋 錦糸町 五反田 大宮(埼玉) 千葉 柏 町田 立川 横浜 溝の口 本厚木 藤沢 大船
   西船橋 津田沼 川口 浦和""",

 # 主要ターミナルは屋内施設で雨をしのげる
 "rainyDay": """新宿 新宿三丁目 渋谷 有楽町 銀座 錦糸町 大井町 町田 立川 八王子 調布 二子玉川
   武蔵小杉 溝の口 上大岡 相模大野 橋本 藤沢 柏 津田沼 流山おおたかの森 千葉 船橋 浦和 川口
   所沢 新越谷 南越谷 大船 センター北 センター南 たまプラーザ""",
 "indoor": """新宿 新宿三丁目 渋谷 有楽町 銀座 錦糸町 大井町 町田 立川 八王子 調布 二子玉川
   武蔵小杉 溝の口 上大岡 相模大野 橋本 藤沢 柏 津田沼 流山おおたかの森 千葉 船橋 浦和 川口
   所沢 新越谷 南越谷 大船 センター北 センター南 たまプラーザ""",
}

FOURS = {k: set(v.split()) for k, v in FOURS.items()}
