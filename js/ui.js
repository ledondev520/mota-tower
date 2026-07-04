/**
 * ui.js — 渲染与交互层（Canvas 地图 + HUD + 弹窗 + 输入）
 *
 * Input : MOTA_DATA / MOTA_ENGINE / MOTA_SPRITES / MOTA_AUDIO，index.html 的 DOM
 * Output: 全局对象 MOTA_UI = { boot() }；接管引擎事件并驱动全部画面
 * Pos   : 表现层总装——引擎(规则)与玩家(输入/视听)之间唯一的桥。
 *         输入三通道：键盘（桌面）、虚拟摇杆与方向键（触屏，可切换）；
 *         存档跨浏览器迁移经「导出/导入存档码」弹窗完成。
 * 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
(function (root) {
  "use strict";

  var D = root.MOTA_DATA;
  var E = root.MOTA_ENGINE;
  var S = root.MOTA_SPRITES;
  var A = root.MOTA_AUDIO;
  var F = root.MOTA_FORMULAS;

  var SCALE = 3;                       // 16px 精灵 ×3 = 48px 格
  var CELL = S.TILE * SCALE;
  var GRID = 13;

  var cv, ctx;                         // 主画布
  var animPhase = 0;                   // 全局 2 帧动画相位
  var showDamage = localStorage.getItem("mota_dmg") !== "0"; // 伤害预览开关
  var floaters = [];                   // 飘字 {x,y,text,color,t0}
  var toastTimer = null;
  var keyHeld = {};                    // 键盘长按连续移动
  var moveTimer = null;
  var ctrlMode = localStorage.getItem("mota_ctrl") || "joy"; // 触屏操控：joy 摇杆 | pad 按键
  var MOVE_MS = 150;                   // 触屏持续移动步频

  // ─────────────────────────── DOM 工具 ───────────────────────────

  /** 职责：querySelector 简写。 */
  function $(sel) { return document.querySelector(sel); }

  /** 职责：创建元素并设置类与文本。 */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // ─────────────────────────── 场景切换 ───────────────────────────

  /** 职责：显示指定场景（title | game | end），其余隐藏。 */
  function showScene(name) {
    ["title", "game", "end"].forEach(function (s) {
      $("#scene-" + s).classList.toggle("hidden", s !== name);
    });
  }

  // ─────────────────────────── 地图渲染 ───────────────────────────

  /**
   * 职责：整帧重绘当前层。
   * 思路：先铺地板底 → 逐格画令牌精灵（怪物加 2 帧动画/伤害预览角标）
   *       → 画勇士 → 画飘字。全部使用预渲染 offscreen canvas，绘制开销极小。
   */
  function render() {
    var st = E.getState();
    if (!st) return;
    var grid = st.grids[st.floor];
    ctx.imageSmoothingEnabled = false;
    for (var y = 0; y < GRID; y++) {
      for (var x = 0; x < GRID; x++) {
        drawCell(grid[y][x], x, y, st);
      }
    }
    drawHero(st);
    drawFloaters();
  }

  /** 职责：绘制单元格（地板底 + 实体精灵 + 怪物角标）。 */
  function drawCell(tok, x, y, st) {
    var px = x * CELL, py = y * CELL;
    ctx.drawImage(S.get("floor"), px, py, CELL, CELL);
    if (tok === ".." || tok === "st") return;
    var info = D.tokenInfo(tok);
    var bob = animPhase ? SCALE : 0; // 怪物/NPC 呼吸浮动
    switch (info.type) {
      case "wall":
        ctx.drawImage(S.get("wall"), px, py, CELL, CELL);
        return;
      case "stairs":
        ctx.drawImage(S.get(info.dir === "up" ? "stairs_up" : "stairs_dn"), px, py, CELL, CELL);
        return;
      case "door":
        ctx.drawImage(S.get("door", { y: "gold", b: "blue", r: "red" }[info.color]), px, py, CELL, CELL);
        return;
      case "key":
        ctx.drawImage(S.get("key", { y: "gold", b: "blue", r: "red" }[info.color]), px, py, CELL, CELL);
        return;
      case "potion":
        ctx.drawImage(S.get("potion", tok === "h1" ? "red" : tok === "h2" ? "blue" : "gold"), px, py, CELL, CELL);
        return;
      case "gem":
        ctx.drawImage(S.get("gem", info.atk ? "red" : "blue"), px, py, CELL, CELL);
        return;
      case "equip":
        ctx.drawImage(S.get(info.atk ? "sword" : "shield", tok[1] === "1" ? "steel" : tok[1] === "2" ? "blue" : "gold"), px, py, CELL, CELL);
        return;
      case "shop":
        ctx.drawImage(S.get("shop"), px, py + (animPhase ? 0 : -SCALE) + SCALE, CELL, CELL);
        return;
      case "npc":
        ctx.drawImage(S.get(D.NPCS[info.id].sprite), px, py - bob + SCALE, CELL, CELL);
        return;
      case "monster":
        drawMonster(tok, px, py, bob, st);
        return;
    }
  }

  /** 职责：绘制怪物（2 帧动画 + 可选伤害预览角标）。 */
  function drawMonster(tok, px, py, bob, st) {
    var m = D.MONSTERS[tok];
    ctx.drawImage(S.get(m.sprite, m.tint, animPhase ? 2 : 1), px, py - bob + SCALE, CELL, CELL);
    if (!showDamage || !st.flags.manual) return;
    var p = F.battlePreview(st.hero, m);
    var text, color;
    if (!p.win) { text = "×"; color = "#ff5a5a"; }
    else if (p.damage === 0) { text = "0"; color = "#7bff8e"; }
    else if (p.damage >= st.hero.hp) { text = fmtNum(p.damage); color = "#ff5a5a"; }
    else if (p.damage > st.hero.hp * 0.35) { text = fmtNum(p.damage); color = "#ffb84d"; }
    else { text = fmtNum(p.damage); color = "#efe9dc"; }
    ctx.font = "bold " + 4 * SCALE + "px 'Courier New', monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.strokeStyle = "rgba(10,8,14,.9)";
    ctx.lineWidth = 3;
    ctx.strokeText(text, px + CELL - 2, py + CELL - 3);
    ctx.fillStyle = color;
    ctx.fillText(text, px + CELL - 2, py + CELL - 3);
  }

  /** 职责：大数缩写（1200 → 1.2k），保持角标不溢出。 */
  function fmtNum(n) {
    return n >= 10000 ? (n / 1000).toFixed(0) + "k" : n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);
  }

  /** 职责：绘制勇士（按朝向选精灵，2 帧步行动画）。 */
  function drawHero(st) {
    var name = "hero_" + { up: "up", down: "down", left: "left", right: "right" }[st.dir || "down"];
    var art = animPhase && name === "hero_down" ? 2 : 1;
    ctx.drawImage(S.get(name, null, art), st.pos.x * CELL, st.pos.y * CELL, CELL, CELL);
  }

  /** 职责：绘制飘字（战斗伤害/拾取提示，1 秒上浮消隐）。 */
  function drawFloaters() {
    var now = Date.now();
    floaters = floaters.filter(function (f) { return now - f.t0 < 1000; });
    floaters.forEach(function (f) {
      var k = (now - f.t0) / 1000;
      ctx.globalAlpha = 1 - k;
      ctx.font = "bold " + 5 * SCALE + "px 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.strokeStyle = "rgba(10,8,14,.9)";
      ctx.lineWidth = 4;
      var y = f.y * CELL - k * CELL * 0.8;
      ctx.strokeText(f.text, f.x * CELL + CELL / 2, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x * CELL + CELL / 2, y);
      ctx.globalAlpha = 1;
    });
  }

  /** 职责：添加一条飘字。 */
  function addFloater(x, y, text, color) {
    floaters.push({ x: x, y: y, text: text, color: color, t0: Date.now() });
  }

  // ─────────────────────────── HUD ───────────────────────────

  /** 职责：刷新左侧状态面板（楼层/属性/钥匙/道具按钮可用态）。 */
  function renderHud() {
    var st = E.getState();
    if (!st) return;
    $("#hud-floor").textContent = D.FLOORS[st.floor].name;
    $("#hud-hp").textContent = st.hero.hp;
    $("#hud-atk").textContent = st.hero.atk;
    $("#hud-def").textContent = st.hero.def;
    $("#hud-gold").textContent = st.hero.gold;
    $("#hud-ky").textContent = st.hero.keys.y;
    $("#hud-kb").textContent = st.hero.keys.b;
    $("#hud-kr").textContent = st.hero.keys.r;
    $("#btn-manual").classList.toggle("locked", !st.flags.manual);
    $("#btn-fly").classList.toggle("locked", !st.flags.wand);
    $("#btn-dmg").textContent = showDamage ? "伤害预览:开" : "伤害预览:关";
    $("#btn-mute").textContent = A.isMuted() ? "音效:关" : "音效:开";
  }

  // ─────────────────────────── 弹窗框架 ───────────────────────────

  var modalStack = [];

  /**
   * 职责：打开一个模态弹窗。
   * 参数：title 标题；bodyBuilder(container) 填充内容；opts {onClose}
   */
  function openModal(title, bodyBuilder, opts) {
    var overlay = el("div", "modal-overlay");
    var box = el("div", "modal");
    var head = el("div", "modal-head");
    head.appendChild(el("span", "modal-title", title));
    var close = el("button", "modal-close", "✕");
    close.onclick = function () { closeModal(overlay); };
    head.appendChild(close);
    box.appendChild(head);
    var body = el("div", "modal-body");
    bodyBuilder(body);
    box.appendChild(body);
    overlay.appendChild(box);
    overlay.dataset.onclose = "";
    overlay._onClose = opts && opts.onClose;
    document.body.appendChild(overlay); // 挂 body：标题页/游戏页均可弹出
    modalStack.push(overlay);
    return overlay;
  }

  /** 职责：关闭弹窗（默认栈顶）。 */
  function closeModal(target) {
    var overlay = target || modalStack[modalStack.length - 1];
    if (!overlay) return;
    modalStack = modalStack.filter(function (m) { return m !== overlay; });
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    if (overlay._onClose) overlay._onClose();
    renderHud();
    render();
  }

  // ─────────────────────────── 怪物手册 ───────────────────────────

  /** 职责：打开怪物手册——当前层怪物 + 面板与预计伤害。 */
  function openManual() {
    var st = E.getState();
    if (!st.flags.manual) { toast("还没有怪物手册（在 1 层找仙女）", true); return; }
    var grid = st.grids[st.floor];
    var seen = {};
    grid.forEach(function (row) {
      row.forEach(function (tok) { if (D.MONSTERS[tok]) seen[tok] = true; });
    });
    var toks = Object.keys(seen);
    openModal("怪物手册 · " + D.FLOORS[st.floor].name, function (body) {
      if (!toks.length) { body.appendChild(el("p", "dim", "本层已无怪物。")); return; }
      toks
        .map(function (tok) { return { tok: tok, m: D.MONSTERS[tok], p: F.battlePreview(st.hero, D.MONSTERS[tok]) }; })
        .sort(function (a, b) { return a.p.damage - b.p.damage; })
        .forEach(function (r) {
          var row = el("div", "manual-row");
          var icon = el("canvas", "manual-icon");
          icon.width = icon.height = S.TILE;
          icon.getContext("2d").drawImage(S.get(r.m.sprite, r.m.tint, 1), 0, 0);
          row.appendChild(icon);
          var mid = el("div", "manual-mid");
          var abil = r.m.ability.map(function (a) {
            return { first: "先攻", magic: "魔攻", double: "连击" }[a];
          }).join(" ");
          mid.appendChild(el("div", "manual-name", r.m.name + (abil ? "【" + abil + "】" : "")));
          mid.appendChild(el("div", "manual-stat",
            "生命 " + r.m.hp + "　攻击 " + r.m.atk + "　防御 " + r.m.def + "　金币 " + r.m.gold));
          row.appendChild(mid);
          var dmg = el("div", "manual-dmg");
          if (!r.p.win) { dmg.textContent = "无法战胜"; dmg.classList.add("bad"); }
          else if (r.p.damage >= st.hero.hp) { dmg.textContent = "伤害 " + r.p.damage; dmg.classList.add("bad"); }
          else if (r.p.damage === 0) { dmg.textContent = "伤害 0"; dmg.classList.add("good"); }
          else { dmg.textContent = "伤害 " + r.p.damage; }
          row.appendChild(dmg);
          body.appendChild(row);
        });
    });
  }

  // ─────────────────────────── 楼层传送 ───────────────────────────

  /** 职责：打开楼层传送界面（已到访楼层列表）。 */
  function openFly() {
    var st = E.getState();
    if (!st.flags.wand) { toast("还没有楼层传送器（在 7 层找老人）", true); return; }
    openModal("楼层传送", function (body) {
      var wrap = el("div", "fly-grid");
      st.visited.slice().sort(function (a, b) { return b - a; }).forEach(function (f) {
        var b = el("button", "fly-btn" + (f === st.floor ? " cur" : ""), D.FLOORS[f].name);
        b.onclick = function () {
          closeModal();
          E.flyTo(f);
        };
        wrap.appendChild(b);
      });
      body.appendChild(wrap);
    });
  }

  // ─────────────────────────── 商店 ───────────────────────────

  /** 职责：打开商店界面（金币商店动态价 / 钥匙商店固定价）。 */
  function openShop(id) {
    var conf = D.SHOPS[id];
    openModal(conf.name, function (body) {
      body.appendChild(el("p", "shop-greet", conf.greet));
      var refresh = function () {
        var st = E.getState();
        body.querySelectorAll(".shop-opt").forEach(function (n) { n.remove(); });
        var goldLine = body.querySelector(".shop-gold") || body.appendChild(el("p", "shop-gold"));
        goldLine.textContent = "当前金币：" + st.hero.gold;
        conf.options.forEach(function (opt, i) {
          var price = conf.type === "gold"
            ? F.shopPrice(conf.base, conf.step, st.shopCount[id])
            : opt.price;
          var b = el("button", "shop-opt", opt.label + " —— " + price + " 金币");
          if (st.hero.gold < price) b.classList.add("locked");
          b.onclick = function () {
            if (E.buyShop(id, i)) { A.play("pickup"); refresh(); renderHud(); }
            else A.play("error");
          };
          body.appendChild(b);
        });
      };
      refresh();
    });
  }

  // ─────────────────────────── 存读档 ───────────────────────────

  /** 职责：打开存/读档界面。mode "save"|"load"。 */
  function openSaves(mode) {
    openModal(mode === "save" ? "存档" : "读档", function (body) {
      E.listSaves().forEach(function (s) {
        var label = (s.slot === "auto" ? "自动存档" : "槽位 " + s.slot) + " — " +
          (s.empty ? "（空）" : "第" + s.floor + "层 HP" + s.hp + " 攻" + s.atk + " 防" + s.def +
            "  " + new Date(s.savedAt).toLocaleString());
        var b = el("button", "save-slot" + (s.empty ? " dim" : ""), label);
        b.onclick = function () {
          if (mode === "save") {
            if (s.slot === "auto") { toast("自动档由系统维护", true); return; }
            E.save(s.slot);
            closeModal();
          } else {
            if (s.empty) { toast("该槽位没有存档", true); return; }
            closeModal();
            E.load(s.slot);
            showScene("game");
          }
        };
        body.appendChild(b);
      });
    });
  }

  // ─────────────────────────── 对话 ───────────────────────────

  /**
   * 职责：播放 NPC 对话（逐条点击推进），结束后处理奖励提示/结局。
   */
  function openDialog(payload) {
    var npc = D.NPCS[payload.npc];
    var idx = 0;
    var overlay = openModal(npc.name, function (body) {
      var icon = el("canvas", "dialog-icon");
      icon.width = icon.height = S.TILE;
      icon.getContext("2d").drawImage(S.get(npc.sprite, null, 1), 0, 0);
      body.appendChild(icon);
      var text = el("p", "dialog-text", payload.lines[0]);
      body.appendChild(text);
      var btn = el("button", "dialog-next", "▶ 继续");
      btn.onclick = function () {
        A.play("talk");
        idx++;
        if (idx < payload.lines.length) { text.textContent = payload.lines[idx]; return; }
        closeModal(overlay);
        if (payload.then === "win") showEnd(true);
        else if (payload.reward === "manual") toast("获得【怪物手册】！按 M 查看");
        else if (payload.reward === "wand") toast("获得【楼层传送器】！按 J 使用");
      };
      body.appendChild(btn);
    });
    A.play("talk");
  }

  // ─────────────────────────── 战斗演出 ───────────────────────────

  /**
   * 职责：战斗结果演出——屏幕轻震 + 怪物位置飘伤害字 + 音效连击。
   * 思路：引擎已算完结果；UI 按回合数播放 3~8 次交替打击音，
   *       最后播放胜利音并飘字（-伤害 / +金币）。
   */
  function playBattle(payload) {
    var hits = Math.min(8, Math.max(3, payload.rounds));
    for (var i = 0; i < hits; i++) {
      (function (i) {
        setTimeout(function () { A.play(i % 2 ? "hurt" : "hit"); }, i * 90);
      })(i);
    }
    var wrap = $("#map-wrap");
    wrap.classList.remove("shake");
    void wrap.offsetWidth; // 重启 CSS 动画
    wrap.classList.add("shake");
    setTimeout(function () {
      A.play("battleWin");
      if (payload.damage > 0) addFloater(payload.at.x, payload.at.y, "-" + payload.damage, "#ff7b6b");
      if (payload.gold > 0) addFloater(payload.at.x, Math.max(0, payload.at.y - 1), "+" + payload.gold + "金", "#ffe762");
    }, hits * 90);
  }

  // ─────────────────────────── 提示条 ───────────────────────────

  /** 职责：顶部提示条（2 秒自动消失）。 */
  function toast(text, warn) {
    var t = $("#toast");
    t.textContent = text;
    t.className = warn ? "warn show" : "show";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = ""; }, 2000);
  }

  // ─────────────────────────── 结局 ───────────────────────────

  /** 职责：显示胜利/失败画面与最终成绩。 */
  function showEnd(win) {
    var st = E.getState();
    A.play(win ? "win" : "error");
    $("#end-title").textContent = win ? "🎉 通关！公主获救" : "冒险结束";
    var mins = Math.round((Date.now() - st.startedAt) / 60000);
    $("#end-stats").innerHTML = "";
    [
      ["最终生命", st.hero.hp],
      ["攻击 / 防御", st.hero.atk + " / " + st.hero.def],
      ["剩余金币", st.hero.gold],
      ["行走步数", st.steps],
      ["用时", mins + " 分钟"],
      ["综合评分", st.hero.hp + st.hero.gold * 2 + (st.hero.atk + st.hero.def) * 10],
    ].forEach(function (pair) {
      var row = el("div", "end-row");
      row.appendChild(el("span", "end-k", pair[0]));
      row.appendChild(el("span", "end-v", String(pair[1])));
      $("#end-stats").appendChild(row);
    });
    showScene("end");
  }

  // ─────────────────────────── 引擎事件分发 ───────────────────────────

  /** 职责：接收引擎事件并触发对应视听表现。 */
  function handleEvent(type, payload) {
    var EVT = E.EV;
    switch (type) {
      case EVT.MOVE: break;
      case EVT.BUMP: A.play("error"); break;
      case EVT.PICKUP:
        A.play(payload.name && payload.name.indexOf("钥匙") >= 0 ? "key" :
               payload.detail && payload.detail.indexOf("生命") >= 0 ? "heal" : "pickup");
        toast("获得【" + payload.name + "】 " + (payload.detail || ""));
        break;
      case EVT.DOOR: A.play("door"); break;
      case EVT.BATTLE: playBattle(payload); break;
      case EVT.STAIRS:
        A.play(payload.fly ? "fly" : "stairs");
        toast(D.FLOORS[payload.floor].name);
        break;
      case EVT.DIALOG: openDialog(payload); break;
      case EVT.SHOP: A.play("talk"); openShop(payload.id); break;
      case EVT.TOAST: toast(payload.text, payload.warn); if (payload.warn) A.play("error"); break;
      case EVT.REFRESH: break;
    }
    renderHud();
    render();
  }

  // ─────────────────────────── 输入 ───────────────────────────

  var DIRS = {
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
    W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0],
  };

  /** 职责：键盘输入（方向长按连走；功能键 M/J/D/K/L/Esc）。 */
  function bindKeyboard() {
    document.addEventListener("keydown", function (ev) {
      // 弹窗打开时仅响应 Esc（任何场景下都可关闭弹窗）
      if (modalStack.length) {
        if (ev.key === "Escape") closeModal();
        return;
      }
      if ($("#scene-game").classList.contains("hidden")) return;
      var d = DIRS[ev.key];
      if (d) {
        ev.preventDefault();
        if (!keyHeld[ev.key]) {
          keyHeld[ev.key] = true;
          E.moveHero(d[0], d[1]);
          ensureMoveLoop();
        }
        return;
      }
      var k = ev.key.toLowerCase();
      if (k === "m") openManual();
      else if (k === "j") openFly();
      else if (k === "k") openSaves("save");
      else if (k === "l") openSaves("load");
      else if (k === "t") toggleDamage();
      else if (k === "escape") { /* 无弹窗时无操作 */ }
    });
    document.addEventListener("keyup", function (ev) { delete keyHeld[ev.key]; });
    window.addEventListener("blur", function () { keyHeld = {}; });
  }

  /** 职责：长按方向键时以固定节奏连续移动。 */
  function ensureMoveLoop() {
    if (moveTimer) return;
    moveTimer = setInterval(function () {
      var keys = Object.keys(keyHeld);
      if (!keys.length || modalStack.length) { clearInterval(moveTimer); moveTimer = null; return; }
      var d = DIRS[keys[keys.length - 1]];
      if (d) E.moveHero(d[0], d[1]);
    }, 130);
  }

  /** 职责：触屏一步移动的统一入口（弹窗打开时忽略）。 */
  function touchStep(d) {
    if (!d || modalStack.length) return;
    E.moveHero(d[0], d[1]);
  }

  /**
   * 职责：虚拟摇杆——拖拽出方向，持续按步频移动。
   * 思路：Pointer Events 统一鼠标/触控；捕获指针后计算指心向量，
   *       超过死区(0.28R)时吸附到四方向；方向变更立即走一步并重置节拍，
   *       其余按 MOVE_MS 匀速连走；松手回中停止。
   */
  function bindJoystick() {
    var joy = $("#joystick");
    var thumb = $("#joy-thumb");
    var R = 46;            // 摇杆头最大行程（px）
    var pid = null;        // 当前捕获的指针
    var dir = null;        // 当前方向 [dx,dy]
    var timer = null;

    /** 由指心向量解算四方向（死区内为 null）。 */
    function solve(dx, dy) {
      if (Math.hypot(dx, dy) < R * 0.28) return null;
      return Math.abs(dx) > Math.abs(dy)
        ? (dx > 0 ? [1, 0] : [-1, 0])
        : (dy > 0 ? [0, 1] : [0, -1]);
    }

    function handle(ev) {
      var r = joy.getBoundingClientRect();
      var dx = ev.clientX - (r.left + r.width / 2);
      var dy = ev.clientY - (r.top + r.height / 2);
      var len = Math.hypot(dx, dy) || 1;
      var cl = Math.min(len, R);
      thumb.style.transform =
        "translate(calc(-50% + " + (dx / len) * cl + "px), calc(-50% + " + (dy / len) * cl + "px))";
      var nd = solve(dx, dy);
      if (nd && (!dir || nd[0] !== dir[0] || nd[1] !== dir[1])) {
        dir = nd;
        touchStep(dir);            // 方向变更即时响应
        clearInterval(timer);
        timer = setInterval(function () { touchStep(dir); }, MOVE_MS);
      } else if (!nd) {
        dir = null;
      }
    }

    function reset(ev) {
      if (pid !== null && ev.pointerId !== pid) return;
      pid = null; dir = null;
      clearInterval(timer); timer = null;
      thumb.style.transform = "translate(-50%, -50%)";
      thumb.classList.remove("active");
    }

    joy.addEventListener("pointerdown", function (ev) {
      ev.preventDefault();
      try { joy.setPointerCapture(ev.pointerId); } catch (e) { /* 合成事件无真实指针 */ }
      pid = ev.pointerId;
      thumb.classList.add("active");
      handle(ev);
      if (dir && !timer) timer = setInterval(function () { touchStep(dir); }, MOVE_MS);
    });
    joy.addEventListener("pointermove", function (ev) {
      if (ev.pointerId !== pid) return;
      ev.preventDefault();
      handle(ev);
    });
    joy.addEventListener("pointerup", reset);
    joy.addEventListener("pointercancel", reset);
  }

  /** 职责：屏幕方向键——按下即走，长按连走（Pointer Events，兼容鼠标）。 */
  function bindPad() {
    [["#dpad-up", 0, -1], ["#dpad-down", 0, 1], ["#dpad-left", -1, 0], ["#dpad-right", 1, 0]]
      .forEach(function (cfg) {
        var b = $(cfg[0]);
        var d = [cfg[1], cfg[2]];
        var timer = null;
        var stop = function () { clearInterval(timer); timer = null; };
        b.addEventListener("pointerdown", function (ev) {
          ev.preventDefault();
          try { b.setPointerCapture(ev.pointerId); } catch (e) { /* 合成事件无真实指针 */ }
          touchStep(d);
          stop();
          timer = setInterval(function () { touchStep(d); }, MOVE_MS);
        });
        ["pointerup", "pointercancel"].forEach(function (t) { b.addEventListener(t, stop); });
      });
  }

  /** 职责：应用触屏操控模式（摇杆/按键二选一）并持久化。 */
  function applyCtrlMode() {
    $("#joystick").classList.toggle("hidden", ctrlMode !== "joy");
    $("#dpad").classList.toggle("hidden", ctrlMode !== "pad");
    $("#btn-ctrl-mode").textContent = ctrlMode === "joy" ? "切换按键" : "切换摇杆";
    localStorage.setItem("mota_ctrl", ctrlMode);
  }

  /** 职责：绑定触屏操控区（摇杆 + 方向键 + 快捷键 + 模式切换）。 */
  function bindTouch() {
    bindJoystick();
    bindPad();
    $("#btn-ctrl-mode").onclick = function () {
      ctrlMode = ctrlMode === "joy" ? "pad" : "joy";
      applyCtrlMode();
    };
    $("#btn-quick-manual").onclick = openManual;
    $("#btn-quick-fly").onclick = openFly;
    applyCtrlMode();
  }

  // ─────────────────────────── 存档码导入/导出 ───────────────────────────

  /**
   * 职责：导出存档码弹窗——展示可复制的存档码，支持复制/下载。
   * 思路：engine.exportSave() 异步生成压缩存档码；剪贴板 API 失败时
   *       降级 execCommand；同时提供 .txt 下载（file:// 亦可用）。
   */
  function openExport() {
    if (!E.getState()) { toast("先开始一局冒险", true); return; }
    E.exportSave().then(function (code) {
      openModal("导出存档（跨浏览器）", function (body) {
        body.appendChild(el("p", "shop-greet",
          "复制下方存档码，在任意浏览器打开游戏，从标题页「导入存档」粘贴即可继续冒险。"));
        var ta = el("textarea", "code-box");
        ta.value = code;
        ta.readOnly = true;
        ta.onclick = function () { ta.select(); };
        body.appendChild(ta);
        var row = el("div", "modal-btn-row");
        var copy = el("button", "dialog-next", "复制存档码");
        copy.onclick = function () {
          var done = function () { toast("已复制，去其他浏览器导入吧"); };
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(code).then(done, function () { fallbackCopy(ta, done); });
          } else {
            fallbackCopy(ta, done);
          }
        };
        row.appendChild(copy);
        var dl = el("button", "dialog-next", "下载为文件");
        dl.onclick = function () {
          var a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([code], { type: "text/plain" }));
          a.download = "魔塔存档-" + new Date().toISOString().slice(0, 10) + ".txt";
          a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
        };
        row.appendChild(dl);
        body.appendChild(row);
      });
    }).catch(function (e) { toast("导出失败：" + e.message, true); });
  }

  /** 职责：剪贴板 API 不可用时的选中复制降级。 */
  function fallbackCopy(ta, done) {
    ta.select();
    try { document.execCommand("copy"); done(); }
    catch (e) { toast("请手动全选复制", true); }
  }

  /**
   * 职责：导入存档码弹窗——粘贴或上传文件，成功后直接进入游戏。
   */
  function openImport() {
    openModal("导入存档", function (body) {
      body.appendChild(el("p", "shop-greet",
        "粘贴其他浏览器导出的存档码（MOTA2 开头），或选择存档文件。导入成功后立即继续冒险。"));
      var ta = el("textarea", "code-box");
      ta.placeholder = "在此粘贴存档码…";
      body.appendChild(ta);
      var row = el("div", "modal-btn-row");
      var file = el("button", "dialog-next", "选择文件");
      var input = document.createElement("input");
      input.type = "file";
      input.accept = ".txt,text/plain";
      input.style.display = "none";
      input.onchange = function () {
        if (!input.files[0]) return;
        input.files[0].text().then(function (t) { ta.value = t; });
      };
      body.appendChild(input);
      file.onclick = function () { input.click(); };
      row.appendChild(file);
      var go = el("button", "dialog-next", "导入并继续");
      go.onclick = function () {
        var code = ta.value.trim();
        if (!code) { toast("请先粘贴存档码", true); return; }
        E.importSave(code).then(function () {
          closeModal();
          showScene("game");
          A.play("stairs");
        }).catch(function (e) { toast("导入失败：" + (e && e.message || "存档码无效"), true); });
      };
      row.appendChild(go);
      body.appendChild(row);
    });
  }

  /** 职责：切换地图伤害预览角标。 */
  function toggleDamage() {
    showDamage = !showDamage;
    localStorage.setItem("mota_dmg", showDamage ? "1" : "0");
    renderHud();
    render();
  }

  /** 职责：绑定 HUD 与标题页按钮。 */
  function bindButtons() {
    $("#btn-manual").onclick = openManual;
    $("#btn-fly").onclick = openFly;
    $("#btn-save").onclick = function () { openSaves("save"); };
    $("#btn-load").onclick = function () { openSaves("load"); };
    $("#btn-export").onclick = openExport;
    $("#btn-dmg").onclick = toggleDamage;
    $("#btn-mute").onclick = function () { A.toggleMute(); renderHud(); };
    $("#btn-restart").onclick = function () {
      openModal("重新开始", function (body) {
        body.appendChild(el("p", "dialog-text", "确定放弃当前进度，从 1 层重新开始吗？"));
        var yes = el("button", "dialog-next", "重新开始");
        yes.onclick = function () { closeModal(); E.newGame(); toast("新的冒险开始了"); };
        body.appendChild(yes);
      });
    };
    $("#btn-start").onclick = function () { E.newGame(); showScene("game"); A.play("stairs"); };
    $("#btn-continue").onclick = function () {
      if (E.loadLatest()) showScene("game");
    };
    $("#btn-import").onclick = openImport;
    $("#btn-end-restart").onclick = function () { E.newGame(); showScene("game"); };
    $("#btn-end-title").onclick = function () { showScene("title"); refreshTitle(); };
  }

  /** 职责：刷新标题页"继续冒险"可用态与最新存档摘要。 */
  function refreshTitle() {
    var best = E.latestSave();
    $("#btn-continue").classList.toggle("locked", !best);
    $("#continue-meta").textContent = best
      ? "最新进度：第 " + best.floor + " 层 · 生命 " + best.hp +
        " · " + new Date(best.savedAt).toLocaleString()
      : "";
  }

  // ─────────────────────────── 启动 ───────────────────────────

  /** 职责：初始化画布、事件、动画循环，进入标题场景。 */
  function boot() {
    cv = $("#map");
    cv.width = GRID * CELL;
    cv.height = GRID * CELL;
    ctx = cv.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    E.setOnEvent(handleEvent);
    bindKeyboard();
    bindTouch();
    bindButtons();
    refreshTitle();
    showScene("title");

    // 标题页画一个装饰勇士
    var tc = $("#title-hero");
    tc.width = tc.height = S.TILE;
    tc.getContext("2d").drawImage(S.get("hero_down", null, 1), 0, 0);

    // 全局 2 帧动画 + 飘字重绘循环
    setInterval(function () {
      animPhase = animPhase ? 0 : 1;
      if (!$("#scene-game").classList.contains("hidden")) render();
    }, 450);
    (function raf() {
      if (floaters.length && !$("#scene-game").classList.contains("hidden")) render();
      requestAnimationFrame(raf);
    })();

    // 胜利事件挂钩：引擎设 flags.won 后由对话触发 showEnd
  }

  root.MOTA_UI = { boot: boot };
})(typeof window !== "undefined" ? window : globalThis);
