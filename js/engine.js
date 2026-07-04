/**
 * engine.js — 游戏引擎（状态机与规则执行，不含渲染）
 *
 * Input : MOTA_DATA（数据）、MOTA_FORMULAS（战斗公式）
 * Output: 全局对象 MOTA_ENGINE = { newGame, moveHero, useStairs, flyTo,
 *         buyShop, save, load, listSaves, state, EV }
 *         引擎通过事件回调（onEvent）向 ui.js 推送一切可见变化。
 * Pos   : 局部系统的"规则中枢"——所有玩法规则（移动/战斗/门钥匙/拾取/
 *         商店/NPC/存档）唯一执行点；UI 只做展示与输入转发。
 * 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
(function (root) {
  "use strict";

  var D = root.MOTA_DATA;
  var F = root.MOTA_FORMULAS;

  /** 事件类型枚举（UI 依据 type 渲染表现）。 */
  var EV = {
    MOVE: "move", BUMP: "bump", PICKUP: "pickup", DOOR: "door",
    BATTLE: "battle", STAIRS: "stairs", DIALOG: "dialog", SHOP: "shop",
    REWARD: "reward", WIN: "win", TOAST: "toast", REFRESH: "refresh",
  };

  var state = null;      // 当前对局状态（对外只读）
  var onEvent = null;    // UI 注册的事件回调

  /** 职责：向 UI 派发事件。参数：type 事件类型；payload 附加数据。 */
  function emit(type, payload) {
    if (onEvent) onEvent(type, payload || {});
  }

  /** 职责：解析全部楼层为可变矩阵。返回 [floor][y][x] 令牌。 */
  function parseGrids() {
    return D.FLOORS.map(function (fl) {
      return fl.map.map(function (r) { return r.trim().split(/\s+/); });
    });
  }

  /** 职责：在某层矩阵中定位令牌。返回 {x,y} 或 null。 */
  function findTok(grid, tok) {
    for (var y = 0; y < grid.length; y++)
      for (var x = 0; x < grid[y].length; x++)
        if (grid[y][x] === tok) return { x: x, y: y };
    return null;
  }

  /**
   * 职责：开启新对局。
   * 思路：解析地图 → 复制勇士初始面板 → 定位 F1 起点 → 通知 UI 刷新。
   */
  function newGame() {
    var grids = parseGrids();
    var start = findTok(grids[0], "st");
    state = {
      version: 1,
      hero: JSON.parse(JSON.stringify(D.HERO_INIT)),
      grids: grids,
      floor: 0,                     // 当前层索引（0 基）
      pos: { x: start.x, y: start.y },
      dir: "up",                    // 勇士朝向
      visited: [0],                 // 已到访楼层（楼传用）
      flags: { manual: false, wand: false, bossDead: false },
      shopCount: { $1: 0, $3: 0 },  // 金币商店已购次数（定价用）
      steps: 0,
      startedAt: Date.now(),
    };
    emit(EV.REFRESH, { reason: "newGame" });
  }

  /** 职责：读取 (f,x,y) 的令牌语义；越界视为墙。 */
  function cellInfo(f, x, y) {
    var grid = state.grids[f];
    if (y < 0 || y >= grid.length || x < 0 || x >= grid[y].length) return { type: "wall" };
    var tok = grid[y][x];
    var info = D.tokenInfo(tok);
    info.tok = tok;
    return info;
  }

  /** 职责：把 (x,y) 置为地板。 */
  function clearCell(f, x, y) { state.grids[f][y][x] = ".."; }

  /**
   * 职责：处理勇士一步移动（含全部交互分发）。
   * 思路：
   *   1. 更新朝向；目标格按类型分发：
   *   2. 墙→无事；地板/楼梯→移动（楼梯触发换层）；
   *   3. 道具→拾取加成并移动；门→耗钥匙开门（不移动）；
   *   4. 怪物→战斗判定（致死拦截）；NPC/商店→触发对话/商店界面。
   * 参数：dx,dy ∈ {-1,0,1}，四方向之一。
   * 返回值：无（一切结果经事件回调传出）。
   */
  function moveHero(dx, dy) {
    if (!state || state.flags.won) return;
    var dirs = { "0,-1": "up", "0,1": "down", "-1,0": "left", "1,0": "right" };
    state.dir = dirs[dx + "," + dy] || state.dir;
    var nx = state.pos.x + dx, ny = state.pos.y + dy;
    var info = cellInfo(state.floor, nx, ny);
    var hero = state.hero;

    switch (info.type) {
      case "wall":
        emit(EV.BUMP, {});
        return;

      case "floor":
        state.pos = { x: nx, y: ny };
        state.steps++;
        emit(EV.MOVE, {});
        return;

      case "stairs":
        state.pos = { x: nx, y: ny };
        state.steps++;
        emit(EV.MOVE, {});
        useStairs(info.dir);
        return;

      case "key":
        hero.keys[info.color]++;
        clearCell(state.floor, nx, ny);
        state.pos = { x: nx, y: ny };
        emit(EV.PICKUP, { name: { y: "黄钥匙", b: "蓝钥匙", r: "红钥匙" }[info.color], detail: "+1" });
        return;

      case "potion":
        hero.hp += info.hp;
        clearCell(state.floor, nx, ny);
        state.pos = { x: nx, y: ny };
        emit(EV.PICKUP, { name: info.name, detail: "生命 +" + info.hp });
        return;

      case "gem":
        hero.atk += info.atk; hero.def += info.def;
        clearCell(state.floor, nx, ny);
        state.pos = { x: nx, y: ny };
        emit(EV.PICKUP, { name: info.name, detail: info.atk ? "攻击 +" + info.atk : "防御 +" + info.def });
        return;

      case "equip":
        hero.atk += info.atk; hero.def += info.def;
        clearCell(state.floor, nx, ny);
        state.pos = { x: nx, y: ny };
        emit(EV.PICKUP, {
          name: info.name,
          detail: (info.atk ? "攻击 +" + info.atk : "") + (info.def ? "防御 +" + info.def : ""),
          big: true,
        });
        return;

      case "door":
        if (hero.keys[info.color] > 0) {
          hero.keys[info.color]--;
          clearCell(state.floor, nx, ny);
          emit(EV.DOOR, { color: info.color });
        } else {
          emit(EV.TOAST, { text: "需要" + { y: "黄", b: "蓝", r: "红" }[info.color] + "钥匙", warn: true });
          emit(EV.BUMP, {});
        }
        return;

      case "monster":
        tryBattle(info.tok, nx, ny);
        return;

      case "npc":
        talkNpc(info.id, nx, ny);
        return;

      case "shop":
        emit(EV.SHOP, { id: info.id });
        return;
    }
  }

  /**
   * 职责：战斗入口——预览判定后结算或拦截。
   * 思路：battlePreview 判负/致死则拦截并提示；可胜则结算面板、
   *       清格并派发 BATTLE 事件（含逐回合数据供 UI 演出）。
   * 参数：tok 怪物令牌；x,y 怪物坐标。
   */
  function tryBattle(tok, x, y) {
    var hero = state.hero;
    var m = D.MONSTERS[tok];
    var p = F.battlePreview(hero, m);
    if (!p.win) {
      emit(EV.TOAST, { text: "打不过 " + m.name + "（攻击无法破防）", warn: true });
      emit(EV.BUMP, {});
      return;
    }
    if (p.damage >= hero.hp) {
      emit(EV.TOAST, { text: m.name + " 预计伤害 " + p.damage + "，会阵亡！", warn: true });
      emit(EV.BUMP, {});
      return;
    }
    hero.hp -= p.damage;
    hero.gold += m.gold;
    clearCell(state.floor, x, y);
    if (tok === "bo") state.flags.bossDead = true;
    emit(EV.BATTLE, {
      monster: tok, name: m.name, damage: p.damage, rounds: p.rounds,
      gold: m.gold, at: { x: x, y: y },
    });
  }

  /**
   * 职责：NPC 对话与赠礼。
   * 思路：派发 DIALOG（UI 播放台词）；有 reward 的 NPC 发放奖励；
   *       vanish 的 NPC 对话后消失；公主 = 结局判定（需魔王已死，
   *       地图上魔王挡路保证了顺序，此处直接触发胜利）。
   */
  function talkNpc(id, x, y) {
    var npc = D.NPCS[id];
    if (npc.reward === "win") {
      state.flags.won = true;
      emit(EV.DIALOG, { npc: id, lines: npc.lines, then: "win" });
      return;
    }
    if (npc.reward === "manual") state.flags.manual = true;
    if (npc.reward === "wand") state.flags.wand = true;
    if (npc.vanish) clearCell(state.floor, x, y);
    emit(EV.DIALOG, { npc: id, lines: npc.lines, reward: npc.reward });
  }

  /**
   * 职责：楼梯换层。
   * 参数：dir "up"|"dn"。上楼落到新层 dn 位置，下楼落到新层 up 位置。
   */
  function useStairs(dir) {
    var nf = state.floor + (dir === "up" ? 1 : -1);
    if (nf < 0 || nf >= state.grids.length) return;
    var pair = findTok(state.grids[nf], dir === "up" ? "dn" : "up");
    if (!pair) return;
    state.floor = nf;
    state.pos = { x: pair.x, y: pair.y };
    if (state.visited.indexOf(nf) < 0) state.visited.push(nf);
    autosave();
    emit(EV.STAIRS, { floor: nf });
  }

  /**
   * 职责：楼层传送（需已获得楼层传送器）。
   * 参数：f 目标层索引（必须已到访）。落点 = 该层楼梯旁。
   */
  function flyTo(f) {
    if (!state.flags.wand) { emit(EV.TOAST, { text: "还没有楼层传送器", warn: true }); return; }
    if (state.visited.indexOf(f) < 0) { emit(EV.TOAST, { text: "没到过那一层", warn: true }); return; }
    if (f === state.floor) return;
    var anchor = findTok(state.grids[f], "dn") || findTok(state.grids[f], "st") || findTok(state.grids[f], "up");
    if (!anchor) return;
    state.floor = f;
    state.pos = { x: anchor.x, y: anchor.y };
    autosave();
    emit(EV.STAIRS, { floor: f, fly: true });
  }

  /**
   * 职责：商店购买。
   * 思路：金币商店按 shopPrice 递增定价（三选项共享计数）；
   *       钥匙商店固定价。金币不足则提示。
   * 参数：shopId "$1"|"$2"|"$3"；optIdx 选项下标。
   * 返回值：是否成交。
   */
  function buyShop(shopId, optIdx) {
    var conf = D.SHOPS[shopId];
    var hero = state.hero;
    var opt = conf.options[optIdx];
    var price = conf.type === "gold"
      ? F.shopPrice(conf.base, conf.step, state.shopCount[shopId])
      : opt.price;
    if (hero.gold < price) {
      emit(EV.TOAST, { text: "金币不足（需要 " + price + "）", warn: true });
      return false;
    }
    hero.gold -= price;
    if (conf.type === "gold") {
      hero.hp += opt.hp || 0; hero.atk += opt.atk || 0; hero.def += opt.def || 0;
      state.shopCount[shopId]++;
    } else {
      hero.keys[opt.key]++;
    }
    emit(EV.PICKUP, { name: opt.label, detail: "-" + price + " 金币" });
    return true;
  }

  // ─────────────────────────── 存档 ───────────────────────────

  var SAVE_PREFIX = "mota_save_";

  /** 职责：序列化当前状态（grids 全量存储，体积 ~15KB 可接受）。 */
  function snapshot() {
    return JSON.stringify({
      version: state.version, hero: state.hero, grids: state.grids,
      floor: state.floor, pos: state.pos, dir: state.dir,
      visited: state.visited, flags: state.flags,
      shopCount: state.shopCount, steps: state.steps,
      startedAt: state.startedAt, savedAt: Date.now(),
    });
  }

  /** 职责：写入存档槽。参数：slot "auto"|"1"|"2"|"3"。返回是否成功。 */
  function save(slot) {
    if (!state) return false;
    try {
      localStorage.setItem(SAVE_PREFIX + slot, snapshot());
      if (slot !== "auto") emit(EV.TOAST, { text: "已存档到槽位 " + slot });
      return true;
    } catch (e) {
      emit(EV.TOAST, { text: "存档失败: " + e.message, warn: true });
      return false;
    }
  }

  /** 职责：换层自动存档（静默）。 */
  function autosave() { save("auto"); }

  /** 职责：从存档槽恢复。返回是否成功。 */
  function load(slot) {
    var raw = localStorage.getItem(SAVE_PREFIX + slot);
    if (!raw) { emit(EV.TOAST, { text: "该槽位没有存档", warn: true }); return false; }
    try {
      var s = JSON.parse(raw);
      state = s;
      emit(EV.REFRESH, { reason: "load" });
      emit(EV.TOAST, { text: "读档成功" });
      return true;
    } catch (e) {
      emit(EV.TOAST, { text: "读档失败: " + e.message, warn: true });
      return false;
    }
  }

  /** 职责：列出各槽位存档元信息（供存读档界面展示）。 */
  function listSaves() {
    return ["auto", "1", "2", "3"].map(function (slot) {
      var raw = localStorage.getItem(SAVE_PREFIX + slot);
      if (!raw) return { slot: slot, empty: true };
      try {
        var s = JSON.parse(raw);
        return {
          slot: slot, empty: false, floor: s.floor + 1,
          hp: s.hero.hp, atk: s.hero.atk, def: s.hero.def,
          savedAt: s.savedAt,
        };
      } catch (e) {
        return { slot: slot, empty: true };
      }
    });
  }

  root.MOTA_ENGINE = {
    EV: EV,
    newGame: newGame,
    moveHero: moveHero,
    useStairs: useStairs,
    flyTo: flyTo,
    buyShop: buyShop,
    save: save,
    load: load,
    listSaves: listSaves,
    cellInfo: cellInfo,
    setOnEvent: function (fn) { onEvent = fn; },
    getState: function () { return state; },
  };
})(typeof window !== "undefined" ? window : globalThis);
