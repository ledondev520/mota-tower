/**
 * audio.js — WebAudio 合成音效（无音频文件）
 *
 * Input : Web Audio API
 * Output: 全局对象 MOTA_AUDIO = { play(name), toggleMute(), isMuted() }
 * Pos   : 表现层的听觉反馈；全部音效由振荡器实时合成，
 *         首次用户交互时惰性初始化（符合浏览器自动播放策略）。
 * 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
(function (root) {
  "use strict";

  var ctx = null;   // AudioContext（惰性创建）
  var muted = localStorage.getItem("mota_muted") === "1";

  /** 职责：确保 AudioContext 就绪（必须在用户手势后调用）。 */
  function ensure() {
    if (!ctx) {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  /**
   * 职责：播放一个简单包络的振荡音。
   * 参数：type 波形；f0/f1 起止频率；dur 时长秒；vol 音量；delay 延时秒。
   */
  function tone(type, f0, f1, dur, vol, delay) {
    var ac = ensure();
    if (!ac) return;
    var t0 = ac.currentTime + (delay || 0);
    var osc = ac.createOscillator();
    var g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** 音效配方表：name → 播放函数。 */
  var FX = {
    pickup:  function () { tone("square", 660, 990, 0.09, 0.12); tone("square", 990, 1320, 0.08, 0.10, 0.07); },
    key:     function () { tone("triangle", 880, 1174, 0.12, 0.14); },
    door:    function () { tone("sawtooth", 200, 90, 0.16, 0.10); tone("square", 400, 200, 0.1, 0.06, 0.05); },
    hit:     function () { tone("square", 150, 90, 0.07, 0.16); },
    hurt:    function () { tone("sawtooth", 220, 110, 0.12, 0.14); },
    stairs:  function () { tone("triangle", 440, 660, 0.1, 0.1); tone("triangle", 660, 880, 0.1, 0.1, 0.09); },
    heal:    function () { tone("sine", 523, 1046, 0.18, 0.12); },
    error:   function () { tone("sawtooth", 130, 120, 0.15, 0.12); },
    fly:     function () { tone("sine", 880, 220, 0.3, 0.1); tone("sine", 220, 880, 0.3, 0.08, 0.15); },
    talk:    function () { tone("square", 440, 440, 0.05, 0.08); },
    win: function () {
      [523, 659, 784, 1046].forEach(function (f, i) { tone("square", f, f, 0.16, 0.12, i * 0.14); });
      tone("triangle", 1568, 1568, 0.4, 0.1, 0.56);
    },
    battleWin: function () { tone("square", 587, 587, 0.08, 0.1); tone("square", 880, 880, 0.12, 0.1, 0.08); },
  };

  /** 职责：按名称播放音效（静音时跳过）。 */
  function play(name) {
    if (muted) return;
    var fn = FX[name];
    if (fn) fn();
  }

  /** 职责：切换静音并持久化。返回当前是否静音。 */
  function toggleMute() {
    muted = !muted;
    localStorage.setItem("mota_muted", muted ? "1" : "0");
    return muted;
  }

  root.MOTA_AUDIO = { play: play, toggleMute: toggleMute, isMuted: function () { return muted; } };
})(typeof window !== "undefined" ? window : globalThis);
