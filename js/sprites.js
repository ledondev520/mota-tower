/**
 * sprites.js — 程序化像素美术（16×16 字符矩阵 + 调色板换色）
 *
 * Input : 无依赖（纯数据 + Canvas API）
 * Output: 全局对象 MOTA_SPRITES = { get(name, tint, frame), TILE }
 *         get 返回预渲染好的 offscreen canvas（16×16），由 ui.js 放大绘制。
 * Pos   : 表现层的美术资产库——所有可见元素（地形/道具/怪物/NPC/勇士）
 *         都由本文件的字符矩阵定义，无任何外部图片。
 * 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 *
 * 字符矩阵约定：'.' 透明；其余字符经"精灵调色板"映射为颜色。
 * 同一形状（sprite）配不同调色板（tint）实现怪物家族换色复用。
 * 动画：每个精灵可有 2 帧；无第 2 帧时由 ui.js 用 1px 上下浮动模拟。
 */
(function (root) {
  "use strict";

  var TILE = 16; // 精灵原生尺寸（像素）

  // ── 通用色 ──
  var C = {
    k: "#141019", // 轮廓黑
    w: "#f8f4ea", // 白
    W: "#c9c2b8", // 灰白影
    s: "#f0c8a0", // 肤色
    S: "#c89060", // 肤色影
    e: "#2c2333", // 眼
  };

  /** 怪物/物件家族调色板：字符 → 颜色。 */
  var TINTS = {
    // 史莱姆
    green:  { "1": "#5ac54f", "2": "#33984b", "3": "#99e550", "4": "#1e6f50" },
    red:    { "1": "#e6482e", "2": "#a93b3b", "3": "#f47e1b", "4": "#7a1f2b" },
    blue:   { "1": "#4fa4b8", "2": "#2e5f8a", "3": "#8fd3ff", "4": "#1b3c66" },
    // 蝙蝠/幽灵/石头
    gray:   { "1": "#8b9bb4", "2": "#5a6988", "3": "#c7cfdd", "4": "#3e4a6b" },
    purple: { "1": "#a884f3", "2": "#7b53ad", "3": "#d9c8ff", "4": "#4e3a75" },
    stone:  { "1": "#a0938e", "2": "#71625d", "3": "#c7bcb4", "4": "#4c403c" },
    ghost:  { "1": "#9cd6c9", "2": "#5fa7a0", "3": "#d8fff4", "4": "#3b6f6d" },
    // 人形
    bone:   { "1": "#e6e1d3", "2": "#b5ac93", "3": "#f8f4ea", "4": "#7a715c" },
    soldier:{ "1": "#e6e1d3", "2": "#b5ac93", "3": "#5ac54f", "4": "#7a715c" },
    captain:{ "1": "#e6e1d3", "2": "#b5ac93", "3": "#e6482e", "4": "#7a715c" },
    gold:   { "1": "#f4b41b", "2": "#c28320", "3": "#ffe762", "4": "#8a5a17" },
    steel:  { "1": "#b6c0d1", "2": "#7c8aa5", "3": "#e5ecf5", "4": "#4d5a75" },
    dark:   { "1": "#6b5f8a", "2": "#443c5e", "3": "#9a8fc0", "4": "#2b2540" },
    boss:   { "1": "#8a2744", "2": "#5c1832", "3": "#e6482e", "4": "#3a0f22" },
  };

  /**
   * 精灵字符矩阵库。键 = sprite 名；值 = { f1:[16行], f2?:[16行], pal?:附加调色 }
   * 行内字符：'.'透明，k/w/W/s/S/e 用通用色，1-4 用 tint 调色板，其余查 pal。
   */
  var ART = {};

  // ── 地形 ──
  ART.floor = {
    pal: { a: "#3a3348", b: "#413a52", c: "#352e42" },
    f1: [
      "aaaaaaaabbbbbbbb", "aaaaaaaabbbbbbbb", "aaaacaaabbbbcbbb", "aaaaaaaabbbbbbbb",
      "aaaaaaaabbbbbbbb", "aaaaaaaabbbbbbbb", "aacaaaaabbcbbbbb", "aaaaaaaabbbbbbbb",
      "bbbbbbbbaaaaaaaa", "bbbbbbbbaaaaaaaa", "bbbbcbbbaaaacaaa", "bbbbbbbbaaaaaaaa",
      "bbbbbbbbaaaaaaaa", "bbbbbbbbaaaaaaaa", "bbcbbbbbaacaaaaa", "bbbbbbbbaaaaaaaa",
    ],
  };
  ART.wall = {
    pal: { a: "#6b5f6e", b: "#574b5c", c: "#7d7182", d: "#443a4a", m: "#2b2433" },
    f1: [
      "aaaaaaamaaaaaaam", "acaaaabmaacaaabm", "aaaaaaamaaaaaaam", "abbbbbbmabbbbbbm",
      "mmmmmmmmmmmmmmmm", "aaamaaaaaaamaaaa", "acbmaacaaabmaaca", "aaamaaaaaaamaaaa",
      "abbmabbbbbbmabbb", "mmmmmmmmmmmmmmmm", "aaaaaaamaaaaaaam", "acaaaabmaacaaabm",
      "aaaaaaamaaaaaaam", "abbbbbbmabbbbbbm", "mmmmmmmmmmmmmmmm", "dddddddddddddddd",
    ],
  };
  ART.stairs_up = {
    pal: { a: "#8f8296", b: "#6b5f6e", c: "#bfb3c4", d: "#241e2c", y: "#ffe762" },
    f1: [
      "dddddddddddddddd", "dcccccccccccccdd", "dcaaaaaaaaaaabdd", "dcaaaaaaaaaaabdd",
      "ddddddddddaaabdd", "ddcccccccdaaabdd", "ddcaaaaabdaaabdd", "ddcaaaaabdaaabdd",
      "dddddddabdaaabdd", "dddccccabdaaabdd", "dddcaaaabdaaabdd", "dddcaaaabdaaabdd",
      "dddcyaaabdaaabdd", "dddcaaaabdaaabdd", "dddddddddddddddd", "dddddddddddddddd",
    ],
  };
  ART.stairs_dn = {
    pal: { a: "#8f8296", b: "#6b5f6e", c: "#bfb3c4", d: "#241e2c", y: "#8fd3ff" },
    f1: [
      "dddddddddddddddd", "ddccccccccccccdd", "ddbaaaaaaaaaacdd", "ddbaaadddddddddd",
      "ddbaaadcccccccdd", "ddbaaadbaaaaacdd", "ddbaaadbaaaddddd", "ddbaaadbaaadcccd",
      "ddbaaadbaaadbacd", "ddbaaadbaaadbycd", "ddbaaadbaaadbacd", "ddbaaadbaaadbacd",
      "ddbaaadbaaadbacd", "dddddddddddddddd", "dddddddddddddddd", "dddddddddddddddd",
    ],
  };
  /** 门：三色共用一形，tint 提供门体颜色。 */
  ART.door = {
    pal: { d: "#241e2c", m: "#57470f" },
    f1: [
      "dddddddddddddddd", "d1111111111111dd", "d1333333333331dd", "d1311111111131dd",
      "d1312222222131dd", "d1312222222131dd", "d1312222222131dd", "d1312222222131dd",
      "d1312222w22131dd", "d1312222m22131dd", "d1312222222131dd", "d1312222222131dd",
      "d1312222222131dd", "d1311111111131dd", "d1333333333331dd", "dddddddddddddddd",
    ],
  };

  // ── 道具 ──
  ART.key = {
    f1: [
      "................", "................", "................", ".....111........",
      "....1kkk1.......", "....1k.k1.......", "....1kkk1.......", ".....111........",
      "......11........", "......11........", "......1111......", "......11........",
      "......1111......", "................", "................", "................",
    ],
  };
  ART.potion = {
    pal: { g: "#8fd3ff" },
    f1: [
      "................", "......kkk.......", "......kwk.......", "......kwk.......",
      ".....kk1kk......", "....k11111k.....", "...k1111111k....", "...k1122211k....",
      "...k1122211k....", "...k1112111k....", "...k1111111k....", "....k11111k.....",
      ".....kkkkk......", "................", "................", "................",
    ],
  };
  ART.gem = {
    f1: [
      "................", "................", "................", ".....kkkkkk.....",
      "....k333331k....", "...k33111121k...", "..k3311111221k..", "..k3111111121k..",
      "...k11111112k...", "....k111112k....", ".....k1112k.....", "......k11k......",
      ".......kk.......", "................", "................", "................",
    ],
  };
  ART.sword = {
    f1: [
      "................", "..........kk....", ".........kwwk...", ".........kww1k..",
      "........kww1k...", ".......kww1k....", "......kww1k.....", ".....kww1k......",
      "..kk.kw1k.......", "..k2k11k........", "...k22k.........", "...k22k.........",
      "..k2kk2k........", "..kk..kk........", "................", "................",
    ],
  };
  ART.shield = {
    f1: [
      "................", "................", "...kkkkkkkkk....", "..k111111111k...",
      "..k122222221k...", "..k12w2222w21k..", "..k122222221k...", "..k122111221k...",
      "..k122111221k...", "..k122222221k...", "...k1222221k....", "....k12221k.....",
      ".....k121k......", "......k1k.......", ".......k........", "................",
    ],
  };
  ART.book = {
    pal: { r: "#e6482e", p: "#f8f4ea" },
    f1: [
      "................", "................", "..kkkkkkkkkkk...", ".krrrrrrrrrrkk..",
      ".krrrrrrrrrrkpk.", ".krrwwwwwwrrkpk.", ".krrrrrrrrrrkpk.", ".krrwwwwrrrrkpk.",
      ".krrrrrrrrrrkpk.", ".krrwwwwwwrrkpk.", ".krrrrrrrrrrkpk.", ".krrrrrrrrrrkk..",
      "..kkkkkkkkkkk...", "................", "................", "................",
    ],
  };
  ART.wand = {
    pal: { y: "#ffe762", p: "#a884f3" },
    f1: [
      "................", "..........yy....", ".........yppy...", ".........yppy...",
      "..........yy....", ".........kwk....", "........kwk.....", ".......kwk......",
      "......kwk.......", ".....kwk........", "....kwk.........", "...kwk..........",
      "...kk...........", "................", "................", "................",
    ],
  };

  // ── 勇士（含四方向 + 走路第二帧） ──
  var HERO_PAL = { a: "#3d6bd6", b: "#28468f", c: "#f4b41b", h: "#6b4a2b" };
  ART.hero_down = {
    pal: HERO_PAL,
    f1: [
      "................", ".....kkkkkk.....", "....kccccc k....", "....kchhhhck....",
      "....khsssshk....", "....ksesseske...", "....kssssssk....", ".....kssss......",
      "....kaaaaaak....", "...ksaaaaaask...", "...ksaabbaask...", "...kkaabbaakk...",
      ".....kbkkbk.....", ".....kbk.kbk....", ".....kkk.kkk....", "................",
    ],
    f2: [
      "................", "................", ".....kkkkkk.....", "....kccccck.....",
      "....kchhhhck....", "....khsssshk....", "....ksesseske...", "....kssssssk....",
      ".....kssss......", "....kaaaaaak....", "...ksaaaaaask...", "...kkaabbaakk...",
      ".....kbbkbbk....", "....kbk...kbk...", "....kkk...kkk...", "................",
    ],
  };
  ART.hero_up = {
    pal: HERO_PAL,
    f1: [
      "................", ".....kkkkkk.....", "....kccccck.....", "....kchhhhck....",
      "....khhhhhhk....", "....khhhhhhk....", "....khhhhhhk....", ".....khhhh......",
      "....kaaaaaak....", "...ksaaaaaask...", "...ksaabbaask...", "...kkaabbaakk...",
      ".....kbkkbk.....", ".....kbk.kbk....", ".....kkk.kkk....", "................",
    ],
  };
  ART.hero_left = {
    pal: HERO_PAL,
    f1: [
      "................", ".....kkkkkk.....", "....kccccck.....", "....kchhhhck....",
      "....khssshhk....", "....kseshhhk....", "....kssshhhk....", ".....kssshh.....",
      "....kaaaaaak....", "....ksaaaaak....", "....ksabbaak....", "....kkabbaak....",
      ".....kbkbk......", ".....kbkkbk.....", ".....kkk.kk.....", "................",
    ],
  };
  ART.hero_right = {
    pal: HERO_PAL,
    f1: [
      "................", ".....kkkkkk.....", ".....kccccck....", "....kchhhhck....",
      "....khhsssk.....", "....khhhsesk....", "....khhhsssk....", ".....hhsssk.....",
      "....kaaaaaak....", "....kaaaaask....", "....kaabbask....", "....kaabbakk....",
      "......kbkbk.....", ".....kbkkbk.....", ".....kk.kkk.....", "................",
    ],
  };

  // ── 怪物家族 ──
  ART.slime = {
    f1: [
      "................", "................", "................", "......kkkk......",
      "....kk3333kk....", "...k33333331k...", "...k3w13331wk...", "..k31e13311e1k..",
      "..k3113333111k..", "..k1133333311k..", ".k113333333311k.", ".k111111111111k.",
      "..kkkkkkkkkkkk..", "................", "................", "................",
    ],
    f2: [
      "................", "................", "................", "................",
      "......kkkk......", "...kk33333kk....", "..k333333331k...", ".k33w13331w31k..",
      ".k31e13311e311k.", ".k311333331111k.", "k11333333333111k", "k11111111111111k",
      ".kkkkkkkkkkkkkk.", "................", "................", "................",
    ],
  };
  ART.bat = {
    f1: [
      "................", "................", "..k..........k..", "..kk........kk..",
      "..k1k..kk..k1k..", "..k11kk11kk11k..", "..k1111111111k..", "...k11311311k...",
      "...k113w13w1k...", "....k111111k....", ".....k1221k.....", "......k22k......",
      ".......kk.......", "................", "................", "................",
    ],
    f2: [
      "................", "................", "................", "................",
      ".....k....k.....", "..kkk1kkk1kkk...", ".k111111111111k.", ".k11311311111k..",
      "..k13w13w111k...", "...k11111111k...", "....k122211k....", ".....k2222k.....",
      "......kkkk......", "................", "................", "................",
    ],
  };
  ART.skeleton = {
    f1: [
      "................", ".....kkkkk......", "....k11111k.....", "....k1e1e1k.....",
      "....k11111k.....", ".....k444k......", "....kk111kk.....", "...k3k111k3k....",
      "...k3k111k3k....", "...kkk111kkk....", ".....k1k1k......", ".....k1k1k......",
      "....kk1k1kk.....", "....k11k11k.....", "....kkk.kkk.....", "................",
    ],
  };
  ART.mage = {
    f1: [
      "................", "......kkk.......", ".....k111k......", "....k11111k.....",
      "...k1111111k....", "...kkkkkkkkk....", "....ksesesk.....", "....ksssssk.....",
      "...k1111111k....", "..k111111111k...", "..k1w11111e1k...", "..k1w1111111k...",
      "..k1w1111111k...", "...k111111k.....", "...kkkkkkkk.....", "................",
    ],
  };
  ART.guard = {
    f1: [
      "................", ".....kkkkk......", "....k11111k.....", "....k1kkk1k.....",
      "....k1sss1k.....", "....k1ses1k.....", ".....ksssk......", "....kk222kk.....",
      "...kw2k2k2wk....", "...kwk222kwk....", "...kwk222kwk....", "...kkk111kkk....",
      ".....k1k1k......", ".....k1k1k......", "....kk1.1kk.....", "................",
    ],
  };
  ART.orc = {
    f1: [
      "................", "....kkkkkkk.....", "...k1111111k....", "..k111111111k...",
      "..k1e11111e1k...", "..k111111111k...", "..k1w1111w11k...", "...k1111111k....",
      "....kk222kk.....", "...k2k222k2k....", "..k22k222k22k...", "..kkkk222kkkk...",
      ".....k2k2k......", ".....k2k2k......", "....kk2.2kk.....", "................",
    ],
  };
  ART.golem = {
    f1: [
      "................", "....kkkkkkkk....", "...k11111111k...", "...k1e1111e1k...",
      "...k11111111k...", "....k111111k....", "..kkk222222kkk..", ".k11k222222k11k.",
      ".k11k222222k11k.", ".k11k222222k11k.", "..kkk222222kkk..", "....k22kk22k....",
      "....k22k.k22k...", "...kk22k.k22kk..", "...kkkkk.kkkkk..", "................",
    ],
  };
  ART.swords = {
    f1: [
      "......kk........", "..kk..kwk..kk...", ".kwwk.kwk.kwwk..", "..kwwkkwkkww1k..",
      "...k1wkwkw1k....", "....k11111k.....", "....ksesesk.....", ".....ksssk......",
      "....kk111kk.....", "...k1k111k1k....", "...kkk111kkk....", "....k11111k.....",
      ".....k1k1k......", ".....k1k1k......", "....kk1.1kk.....", "................",
    ],
  };
  ART.wraith = {
    f1: [
      "................", "......kkkk......", ".....k1111k.....", "....k111111k....",
      "....k1e11e1k....", "....k111111k....", "...k11133111k...", "...k11311311k...",
      "...k11111111k...", "...k11111111k...", "....k111111k....", "....k1k11k1k....",
      ".....k.k1k.k....", ".......k1k......", "........k.......", "................",
    ],
  };
  ART.vampire = {
    f1: [
      "................", ".....kkkkk......", "....k11111k.....", "...k1111111k....",
      "...k1w111w1k....", "...k1e111e1k....", "....k11111k.....", "....kw111wk.....",
      "...kk22222kk....", "..k2k22222k2k...", "..k2k22222k2k...", "..kkk22222kkk...",
      "....k22k22k.....", "....k2k.k2k.....", "...kk2k.k2kk....", "................",
    ],
  };
  ART.knight = {
    f1: [
      "................", ".....kkkkk......", "....k11111k.....", "....k1w1w1k.....",
      "....k11111k.....", "....kk111kk.....", "...k1k222k1k....", "..k11k222k11k...",
      "..k1kk222kk1k...", "..kkk22222kkk...", "....k22222k.....", "....k22k22k.....",
      "....k2k.k2k.....", "...kk2k.k2kk....", "...kkkk.kkkk....", "................",
    ],
  };
  ART.dragon = {
    f1: [
      "..k..........k..", ".k1k........k1k.", ".k11k......k11k.", ".k111kkkkkk111k.",
      ".k111111111111k.", "..k1e111111e1k..", "..k1111111111k..", "..k11w1111w11k..",
      "...k11111111k...", "..k1122222211k..", ".k111222222111k.", ".k11k222222k11k.",
      "..kk k2222k kk..", ".....k2kk2k.....", "....kk2k.k2kk...", "................",
    ],
  };
  ART.boss = {
    f1: [
      ".k1k........k1k.", ".k11k..kk..k11k.", ".k111kk33kk111k.", ".k11133333311k..",
      "..k133333331k...", "..k3e3333e33k...", "..k333333333k...", "..k33w333w33k...",
      "...k3333333k....", "..kk2222222kk...", ".k11k22222k11k..", ".k1k2222222k1k..",
      "..kk222k222kk...", "....k22.k22k....", "...kk2k..k2kk...", "..kkkk....kkkk..",
    ],
    f2: [
      ".k1k........k1k.", ".k11k..kk..k11k.", ".k111kk33kk111k.", "..k1133333311k..",
      "...k13333331k...", "..k3e3333e33k...", "..k333333333k...", "..k33w333w33k...",
      "...k3333333k....", "..kk2222222kk...", ".k11k22222k11k..", ".k1k2222222k1k..",
      "..kk222k222kk...", "...k22k..k22k...", "..kk2k....k2kk..", ".kkkk......kkkk.",
    ],
  };

  // ── NPC ──
  ART.fairy = {
    pal: { p: "#f7a8d8", q: "#d96bb0", y: "#ffe762" },
    f1: [
      "................", "......kkk.......", ".....kyyyk......", "....k.kkk.k.....",
      "..kk.ksssk.kk...", ".kppkkseskkppk..", "kpppksssssk pppk", "kppk ksssk .kppk",
      ".kk.kpppppk..kk.", "....kpqpqpk.....", "....kpppppk.....", ".....kqqqk......",
      "....kpk.kpk.....", "....kk...kk.....", "................", "................",
    ],
  };
  ART.oldman = {
    pal: { g: "#9a8fc0", h: "#f8f4ea" },
    f1: [
      "................", ".....kkkkk......", "....khhhhhk.....", "....khsssk......",
      "....ksesesk.....", "....khssshk.....", "....khhhhhk.....", ".....khhhk......",
      "....kgggggk.....", "...kggggggg k...", "...kg ggggg k...", "...k gggggg.k...",
      "....kgggggk.....", "....kg.k.gk.....", "....kk.k.kk.....", ".......k........",
    ],
  };
  ART.princess = {
    pal: { p: "#f7a8d8", q: "#d96bb0", y: "#ffe762", h: "#c8742f" },
    f1: [
      "................", ".....y.y.y......", ".....kyyyk......", "....khhhhhk.....",
      "...kh hhhh hk...", "...khsssssshk...", "...khsesseshk...", "....ksssss......",
      "....kpppppk.....", "...kpppppppk....", "...kpqpppqpk....", "..kpppppppppk...",
      "..kpqpppppqpk...", "..kpppppppppk...", "...kkkkkkkkk....", "................",
    ],
  };

  // ── 商店（宝箱造型的柜台） ──
  ART.shop = {
    pal: { a: "#c28320", b: "#8a5a17", c: "#ffe762", d: "#57470f" },
    f1: [
      "................", "................", "...kkkkkkkkkk...", "..kaaaaaaaaaak..",
      ".kaacaaaacaaaak.", ".kaaaaaaaaaaaak.", ".kbbbbbbbbbbbbk.", ".kbbbbbkkbbbbbk.",
      ".kbbbbkcckbbbbk.", ".kbbbbkcckbbbbk.", ".kbbbbbkkbbbbbk.", ".kbbbbbbbbbbbbk.",
      ".kddddddddddddk.", "..kkkkkkkkkkkk..", "................", "................",
    ],
  };

  // ─────────────────────────── 渲染实现 ───────────────────────────

  var cache = {}; // "name|tint|frame" → canvas

  /**
   * 职责：把字符矩阵渲染为 16×16 offscreen canvas（带缓存）。
   * 思路：逐字符查色——通用色 C → 精灵自带 pal → tint 调色板；'.'跳过。
   * 参数：name 精灵名；tint 调色板名（可空）；frame 1|2（无 f2 回退 f1）。
   * 返回值：HTMLCanvasElement（16×16）。
   */
  function get(name, tint, frame) {
    var key = name + "|" + (tint || "") + "|" + (frame || 1);
    if (cache[key]) return cache[key];
    var art = ART[name];
    if (!art) throw new Error("未知精灵: " + name);
    var rows = frame === 2 && art.f2 ? art.f2 : art.f1;
    var pal = TINTS[tint] || {};
    var cv = document.createElement("canvas");
    cv.width = TILE;
    cv.height = TILE;
    var ctx = cv.getContext("2d");
    for (var y = 0; y < TILE; y++) {
      var row = rows[y] || "";
      for (var x = 0; x < TILE; x++) {
        var ch = row[x] || ".";
        if (ch === ".") continue;
        var color = C[ch] || (art.pal && art.pal[ch]) || pal[ch];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    cache[key] = cv;
    return cv;
  }

  root.MOTA_SPRITES = { get: get, TILE: TILE, TINTS: TINTS };
})(typeof window !== "undefined" ? window : globalThis);
