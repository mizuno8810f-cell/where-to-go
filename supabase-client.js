/* ============================================================
   Supabase 訪問履歴クライアント（匿名認証）
   - React(app.js) より前に、素の <script> として読み込む。
   - window.__SUPABASE__ (config.js) と window.supabase (supabase-js CDN) を利用。
   - 公開用(anon public)キーのみを使用。service_role キーは絶対に使わない。
   - 未設定/接続不可でも throw せず、window.SupaHistory.enabled=false で無効化する。
   ============================================================ */
(function () {
  "use strict";

  var cfg = (typeof window !== "undefined" && window.__SUPABASE__) || {};
  // URLは「オリジン(https://xxx.supabase.co)」だけに補正する。
  // 末尾スラッシュや /rest/v1 等のパスが混ざっていても自動で除去（"Invalid path" 対策）。
  var rawUrl = cfg.url ? String(cfg.url).trim() : "";
  var url = "";
  if (rawUrl) {
    try { url = new URL(rawUrl).origin; }
    catch (e) { url = rawUrl.replace(/\/+$/, ""); }
  }
  var anonKey = cfg.anonKey ? String(cfg.anonKey).trim() : "";
  var configured =
    !!url && !!anonKey &&
    url.indexOf("YOUR_") === -1 &&
    anonKey.indexOf("YOUR_") === -1;

  var state = { enabled: false, client: null, userId: null, ready: null, lastError: "" };

  function makeApi() {
    return {
      get configured() { return configured; },
      get enabled() { return state.enabled; },
      get userId() { return state.userId; },
      get lastError() { return state.lastError; },
      ready: function () { return state.ready; },

      // 集計値の取得（合計値のみ。RLSを迂回するsecurity definer関数を呼ぶ）
      getStats: async function () {
        if (!state.enabled) throw new Error("supabase-disabled");
        var res = await state.client.rpc("get_app_stats");
        if (res.error) throw res.error;
        return (res.data && res.data[0]) || null;
      },

      // アクセス集計：ページビューを1件記録（app_events）。個人情報は保存しない。
      logPageView: async function () {
        if (!state.enabled) return false;
        var res = await state.client
          .from("app_events")
          .insert({ user_id: state.userId, event: "page_view" });
        if (res.error) throw res.error;
        return true;
      },

      // 現在の匿名ユーザーが、その駅へ行った回数（RLSにより自分の行だけが対象）
      getVisitCount: async function (stationId) {
        if (!state.enabled) return 0;
        var res = await state.client
          .from("station_visits")
          .select("id", { count: "exact", head: true })
          .eq("user_id", state.userId)
          .eq("station_id", stationId);
        if (res.error) throw res.error;
        return res.count || 0;
      },

      // 「行った」を1レコード追加（複数回行けば複数レコード）
      addVisit: async function (stationId) {
        if (!state.enabled) throw new Error("supabase-disabled");
        var res = await state.client
          .from("station_visits")
          .insert({ user_id: state.userId, station_id: stationId });
        if (res.error) throw res.error;
        return true;
      },

      // 直近の訪問履歴（自分のぶんのみ）
      getRecentVisits: async function (limit) {
        if (!state.enabled) return [];
        var res = await state.client
          .from("station_visits")
          .select("station_id, visited_at")
          .eq("user_id", state.userId)
          .order("visited_at", { ascending: false })
          .limit(limit || 10);
        if (res.error) throw res.error;
        return res.data || [];
      },

      // 全訪問を集計して { station_id: { count, lastVisit(YYYY-MM-DD) } } を返す
      // 起動時に各駅の訪問回数を復元するために使う
      getCountsSummary: async function () {
        if (!state.enabled) return {};
        var res = await state.client
          .from("station_visits")
          .select("station_id, visited_at")
          .eq("user_id", state.userId);
        if (res.error) throw res.error;
        var m = {};
        (res.data || []).forEach(function (r) {
          var e = m[r.station_id] || { count: 0, lastVisit: null };
          e.count += 1;
          var d = r.visited_at ? String(r.visited_at).slice(0, 10) : null;
          if (d && (!e.lastVisit || d > e.lastVisit)) e.lastVisit = d;
          m[r.station_id] = e;
        });
        return m;
      },

      // その駅の「自分の」履歴をすべて削除（記録をリセット用）
      deleteVisits: async function (stationId) {
        if (!state.enabled) throw new Error("supabase-disabled");
        var res = await state.client
          .from("station_visits")
          .delete()
          .eq("user_id", state.userId)
          .eq("station_id", stationId);
        if (res.error) throw res.error;
        return true;
      },

      // その駅の最新の1件だけ削除（−1用）
      removeOneVisit: async function (stationId) {
        if (!state.enabled) throw new Error("supabase-disabled");
        var sel = await state.client
          .from("station_visits")
          .select("id")
          .eq("user_id", state.userId)
          .eq("station_id", stationId)
          .order("visited_at", { ascending: false })
          .limit(1);
        if (sel.error) throw sel.error;
        if (!sel.data || !sel.data.length) return false;
        var del = await state.client
          .from("station_visits")
          .delete()
          .eq("id", sel.data[0].id);
        if (del.error) throw del.error;
        return true;
      },
    };
  }

  // 設定なし or supabase-js 未読込 → 無効化して終了（アプリ本体は通常動作）
  if (!configured || !window.supabase || !window.supabase.createClient) {
    state.ready = Promise.resolve(false);
    if (!configured) {
      state.lastError = "接続情報が未設定（config.js）";
      console.warn("[SupaHistory] Supabase未設定（config.js）。訪問履歴のクラウド保存は無効です。");
    } else {
      state.lastError = "supabase-js を読み込めませんでした（ネットワーク/ブロッカー）";
      console.warn("[SupaHistory] supabase-js を読み込めませんでした。訪問履歴のクラウド保存は無効です。");
    }
    window.SupaHistory = makeApi();
    return;
  }

  var client = window.supabase.createClient(url, anonKey, {
    auth: {
      persistSession: true,     // 同じブラウザでセッションを維持（再訪問で履歴復元）
      autoRefreshToken: true,
      storageKey: "dokoiku-auth",
    },
  });
  state.client = client;

  // 初回のみ匿名サインイン。既存セッションがあればそれを使う。
  state.ready = (async function () {
    try {
      var session = (await client.auth.getSession()).data.session;
      if (!session) {
        var r = await client.auth.signInAnonymously();
        if (r.error) throw r.error;
        session = r.data.session;
      }
      state.userId = session && session.user ? session.user.id : null;
      state.enabled = !!state.userId;
      return state.enabled;
    } catch (e) {
      state.lastError = "匿名ログイン失敗: " + ((e && e.message) || String(e));
      console.error("[SupaHistory] 匿名認証に失敗しました:", (e && e.message) || e);
      state.enabled = false;
      return false;
    }
  })();

  window.SupaHistory = makeApi();

  // 認証できたら、このページ読み込みを1回だけアクセス記録する（集計テーブルが
  // 未作成でも throw しないよう握りつぶす。アプリ本体の動作には影響しない）。
  state.ready.then(function (ok) {
    if (ok) { try { window.SupaHistory.logPageView().catch(function () {}); } catch (e) {} }
  });
})();
