/* ============================================================
   効果音（Web Audio API でその場合成。外部音源は使わない）
   window.Sfx を提供。ミュートは Cookie(dokoiku_sound) に保存。
   ブラウザ制約でユーザー操作後に鳴るため、最初のタップで unlock() する。
   ============================================================ */
(function () {
  "use strict";
  var AC = window.AudioContext || window.webkitAudioContext;
  var ctx = null;
  var lastTick = 0;

  function readPref() {
    var m = document.cookie.match(/(?:^|; )dokoiku_sound=([^;]*)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
  function writePref(v) {
    var e = new Date(Date.now() + 365 * 864e5).toUTCString();
    document.cookie = "dokoiku_sound=" + v + "; expires=" + e + "; path=/; SameSite=Lax";
  }
  var enabled = readPref() !== "0"; // 既定ON

  function ensure() {
    if (!AC) return null;
    if (!ctx) { try { ctx = new AC(); } catch (e) { return null; } }
    if (ctx.state === "suspended") { ctx.resume().catch(function () {}); }
    return ctx;
  }

  // 単音（周波数を滑らせるとピュン/ポン）
  function tone(o) {
    if (!enabled) return;
    var c = ensure(); if (!c) return;
    var t0 = c.currentTime;
    var dur = o.dur || 0.12;
    var osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || "sine";
    osc.frequency.setValueAtTime(o.f0 || 440, t0);
    if (o.f1) { try { osc.frequency.exponentialRampToValueAtTime(o.f1, t0 + dur); } catch (e) {} }
    var vol = o.vol == null ? 0.06 : o.vol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(c.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  window.Sfx = {
    get enabled() { return enabled; },
    unlock: function () { ensure(); },
    setEnabled: function (v) { enabled = !!v; writePref(enabled ? "1" : "0"); if (enabled) ensure(); },
    toggle: function () { this.setEnabled(!enabled); return enabled; },

    tap: function () { tone({ type: "triangle", f0: 300, f1: 210, dur: 0.06, vol: 0.045 }); },
    tick: function () { var n = Date.now(); if (n - lastTick < 26) return; lastTick = n; tone({ type: "square", f0: 540, dur: 0.028, vol: 0.02 }); },
    plus: function () { tone({ type: "sine", f0: 520, f1: 880, dur: 0.14, vol: 0.06 }); },
    minus: function () { tone({ type: "sine", f0: 440, f1: 220, dur: 0.14, vol: 0.05 }); },
    open: function () { tone({ type: "triangle", f0: 300, f1: 600, dur: 0.16, vol: 0.05 }); },
    win: function () {
      if (!enabled) return; if (!ensure()) return;
      var notes = [660, 880, 1175];
      notes.forEach(function (f, i) {
        setTimeout(function () { tone({ type: "triangle", f0: f, dur: 0.2, vol: 0.06 }); }, i * 95);
      });
    },
  };
})();
