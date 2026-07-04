/**
 * balance_check.mjs — 魔塔数值验证器（`npm run check`）
 *
 * Input : ../js/formulas.js、../js/data.js（经 vm 加载，与游戏共用同一数据与公式）
 * Output: 终端报告：结构校验 + 贪心通关模拟 + 逐层成长曲线；
 *         通关失败或结构非法时 exit 1。
 * Pos   : 数值平衡的"裁判"——任何 data.js 改动必须先过本验证器再交付。
 * 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 *
 * 模拟模型：魔塔中移动零成本，因此玩家状态 = (已消耗的格子, 面板)。
 * 用跨楼层 BFS（楼梯连边）求可达集，贪心策略扮演"稳健玩家"：
 *   免费道具 → 零伤怪 → 低伤怪(按伤害升序、阈值内) → 开门 → 卡关时商店兜底/放宽阈值。
 * 能推进到"击败魔王、抵达公主"即证明塔可通关。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const VERBOSE = process.argv.includes("--verbose");

/**
 * 职责：加载浏览器风格脚本到共享上下文。
 * 参数：files 相对路径数组。
 * 返回值：包含 MOTA_DATA / MOTA_FORMULAS 的上下文对象。
 */
function loadGlobals(files) {
  const ctx = {};
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(readFileSync(join(here, f), "utf8"), ctx);
  return ctx;
}

const { MOTA_DATA: D, MOTA_FORMULAS: F } = loadGlobals(["../js/formulas.js", "../js/data.js"]);

// ─────────────────────────────── 1. 结构校验 ───────────────────────────────

/**
 * 职责：校验全部楼层地图的结构合法性。
 * 思路：1.尺寸 13×13；2.外圈全墙；3.令牌合法；4.楼梯/起点配置正确。
 * 返回值：错误信息数组（空数组 = 通过）。
 */
function validateStructure() {
  const errs = [];
  const N = D.FLOORS.length;
  D.FLOORS.forEach((fl, fi) => {
    const rows = fl.map.map((r) => r.trim().split(/\s+/));
    if (rows.length !== 13) errs.push(`F${fl.id} 行数 ${rows.length} ≠ 13`);
    rows.forEach((r, y) => {
      if (r.length !== 13) errs.push(`F${fl.id} 第${y}行 ${r.length} 列 ≠ 13`);
      r.forEach((tok, x) => {
        try {
          D.tokenInfo(tok);
        } catch (e) {
          errs.push(`F${fl.id} (${x},${y}) ${e.message}`);
        }
        const border = x === 0 || y === 0 || x === r.length - 1 || y === rows.length - 1;
        if (border && tok !== "##") errs.push(`F${fl.id} (${x},${y}) 外圈必须为墙`);
      });
    });
    const flat = rows.flat();
    const need = (tok, want) => {
      const n = flat.filter((t) => t === tok).length;
      if (n !== want) errs.push(`F${fl.id} ${tok} 数量 ${n} ≠ ${want}`);
    };
    need("up", fi === N - 1 ? 0 : 1);
    need("dn", fi === 0 ? 0 : 1);
    need("st", fi === 0 ? 1 : 0);
  });
  return errs;
}

// ─────────────────────────────── 2. 通关模拟 ───────────────────────────────

/** 职责：把楼层地图解析为可变令牌矩阵。返回 [floor][y][x]。 */
function buildGrids() {
  return D.FLOORS.map((fl) => fl.map.map((r) => r.trim().split(/\s+/)));
}

/** 职责：在矩阵中定位某令牌，返回 {x,y} 或 null。 */
function findTok(grid, tok) {
  for (let y = 0; y < grid.length; y++)
    for (let x = 0; x < grid[y].length; x++) if (grid[y][x] === tok) return { x, y };
  return null;
}

/**
 * 职责：跨楼层 BFS 求当前可达集与交互边界。
 * 思路：可通行 = 地板/楼梯/道具（顺路拾取）；楼梯把 (f,up)↔(f+1,dn) 连边；
 *       门/怪物/NPC/商店 = 不可穿越的"边界交互点"。
 * 参数：grids 全塔矩阵；startF/startPos 出发点。
 * 返回值：{ reach:Set("f,x,y"), items:[], doors:[], monsters:[], npcs:[], shops:[] }
 */
function sweep(grids, startF, startPos) {
  const seen = new Set();
  const out = { reach: seen, items: [], doors: [], monsters: [], npcs: [], shops: [] };
  const frontierSeen = new Set();
  const q = [[startF, startPos.x, startPos.y]];
  seen.add(`${startF},${startPos.x},${startPos.y}`);
  while (q.length) {
    const [f, x, y] = q.shift();
    const grid = grids[f];
    const tok = grid[y][x];
    const info = D.tokenInfo(tok);
    // 楼梯连边：站上楼梯即可换层
    if (info.type === "stairs") {
      const nf = info.dir === "up" ? f + 1 : f - 1;
      if (nf >= 0 && nf < grids.length) {
        const pair = findTok(grids[nf], info.dir === "up" ? "dn" : "up");
        if (pair && !seen.has(`${nf},${pair.x},${pair.y}`)) {
          seen.add(`${nf},${pair.x},${pair.y}`);
          q.push([nf, pair.x, pair.y]);
        }
      }
    }
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || ny >= grid.length || nx >= grid[ny].length) continue;
      const key = `${f},${nx},${ny}`;
      const ntok = grid[ny][nx];
      const ninfo = D.tokenInfo(ntok);
      if (ninfo.type === "wall") continue;
      const passable =
        ninfo.type === "floor" || ninfo.type === "stairs" ||
        ninfo.type === "key" || ninfo.type === "potion" ||
        ninfo.type === "gem" || ninfo.type === "equip";
      if (passable) {
        if (!seen.has(key)) {
          seen.add(key);
          q.push([f, nx, ny]);
          if (["key", "potion", "gem", "equip"].includes(ninfo.type))
            out.items.push({ f, x: nx, y: ny, tok: ntok, info: ninfo });
        }
      } else if (!frontierSeen.has(key)) {
        frontierSeen.add(key);
        const rec = { f, x: nx, y: ny, tok: ntok, info: ninfo };
        if (ninfo.type === "door") out.doors.push(rec);
        else if (ninfo.type === "monster") out.monsters.push(rec);
        else if (ninfo.type === "npc") out.npcs.push(rec);
        else if (ninfo.type === "shop") out.shops.push(rec);
      }
    }
  }
  return out;
}

/**
 * 职责：执行贪心通关模拟，返回 {win, hero, floorsLog, events, wasted}。
 * 思路（每轮 sweep 后按优先级行动，直到公主可达或无计可施）：
 *   0. 拾取全部可达道具；对话 NPC（仙女/老人）。
 *   1. 用现有钥匙开全部可开的门。
 *   2. 打零伤怪；按伤害升序打阈值内的怪（战后保留血量下限）。
 *   3. 卡关：钥匙缺→钥匙商店；再买属性（优先解锁战斗的选项）；再放宽阈值。
 */
function simulate() {
  const grids = buildGrids();
  const hero = JSON.parse(JSON.stringify(D.HERO_INIT));
  const start = findTok(grids[0], "st");
  const events = [];
  const floorsLog = []; // 每层首次可达时的面板快照
  const floorSeen = new Set();
  const shopCount = { $1: 0, $3: 0 };
  const thresholds = [
    { frac: 0.35, reserve: 300 },
    { frac: 0.6, reserve: 120 },
    { frac: 0.92, reserve: 1 },
  ];
  let tLevel = 0;
  let fights = 0;

  const log = (s) => { events.push(s); if (VERBOSE) console.log("  " + s); };

  /** 快照首次抵达的楼层。 */
  const snapshotFloors = (reach) => {
    for (const k of reach) {
      const f = Number(k.split(",")[0]);
      if (!floorSeen.has(f)) {
        floorSeen.add(f);
        floorsLog.push({ floor: f + 1, hp: hero.hp, atk: hero.atk, def: hero.def, gold: hero.gold, keys: { ...hero.keys } });
      }
    }
  };

  for (let iter = 0; iter < 20000; iter++) {
    const sw = sweep(grids, 0, start);
    snapshotFloors(sw.reach);

    // 0a. 公主可达 → 胜利
    if (sw.npcs.some((n) => n.tok === "n3")) {
      log("抵达公主 → 通关！");
      return { win: true, hero, floorsLog, events, grids, fights };
    }
    // 0b. 拾取道具
    if (sw.items.length) {
      for (const it of sw.items) {
        const i = it.info;
        if (i.type === "key") hero.keys[i.color]++;
        else if (i.type === "potion") hero.hp += i.hp;
        else { hero.atk += i.atk || 0; hero.def += i.def || 0; }
        grids[it.f][it.y][it.x] = "..";
      }
      log(`拾取 ${sw.items.length} 件道具`);
      continue;
    }
    // 0c. NPC 对话（仙女/老人赠礼后消失）
    const npc = sw.npcs.find((n) => D.NPCS[n.tok].vanish);
    if (npc) {
      grids[npc.f][npc.y][npc.x] = "..";
      log(`对话 ${D.NPCS[npc.tok].name}（获得 ${D.NPCS[npc.tok].reward}）`);
      continue;
    }
    // 1. 开门（有钥匙就开：全塔钥匙供给 ≥ 需求由本验证器背书）
    const door = sw.doors.find((d) => hero.keys[d.info.color] > 0);
    if (door) {
      hero.keys[door.info.color]--;
      grids[door.f][door.y][door.x] = "..";
      log(`开${{ y: "黄", b: "蓝", r: "红" }[door.info.color]}门 @F${door.f + 1}(${door.x},${door.y})`);
      continue;
    }
    // 2. 战斗：零伤优先，其后伤害升序 + 阈值约束
    const previews = sw.monsters
      .map((m) => ({ m, p: F.battlePreview(hero, D.MONSTERS[m.tok]) }))
      .filter((r) => r.p.win)
      .sort((a, b) => a.p.damage - b.p.damage);
    const th = thresholds[tLevel];
    const pick = previews.find(
      (r) => r.p.damage === 0 ||
        (r.p.damage <= hero.hp * th.frac && hero.hp - r.p.damage >= th.reserve)
    );
    if (pick) {
      const md = D.MONSTERS[pick.m.tok];
      hero.hp -= pick.p.damage;
      hero.gold += md.gold;
      grids[pick.m.f][pick.m.y][pick.m.x] = "..";
      fights++;
      log(`战斗 ${md.name} @F${pick.m.f + 1} -${pick.p.damage}HP (剩${hero.hp})`);
      if (tLevel > 0) tLevel = 0; // 打开局面后恢复稳健阈值
      continue;
    }
    // 3a. 缺钥匙且钥匙商店可达 → 购买
    const needColor = sw.doors.find((d) => hero.keys[d.info.color] === 0)?.info.color;
    const keyShop = sw.shops.find((s) => s.tok === "$2");
    if (needColor && keyShop) {
      const opt = D.SHOPS.$2.options.find((o) => o.key === needColor);
      if (opt && hero.gold >= opt.price) {
        hero.gold -= opt.price;
        hero.keys[needColor]++;
        log(`购买${opt.label}(-${opt.price}金)`);
        continue;
      }
    }
    // 3b. 金币商店：优先买能"解锁一场战斗"的选项，否则买攻击
    let bought = false;
    for (const s of sw.shops.filter((s) => D.SHOPS[s.tok].type === "gold")) {
      const conf = D.SHOPS[s.tok];
      const price = F.shopPrice(conf.base, conf.step, shopCount[s.tok]);
      if (hero.gold < price) continue;
      const unlocks = (opt) => {
        const h2 = { ...hero, hp: hero.hp + (opt.hp || 0), atk: hero.atk + (opt.atk || 0), def: hero.def + (opt.def || 0) };
        return sw.monsters.some((m) => {
          const p = F.battlePreview(h2, D.MONSTERS[m.tok]);
          return p.win && p.damage <= h2.hp * th.frac && h2.hp - p.damage >= th.reserve;
        });
      };
      const opt = conf.options.find(unlocks) || conf.options.find((o) => o.atk);
      hero.gold -= price;
      hero.hp += opt.hp || 0;
      hero.atk += opt.atk || 0;
      hero.def += opt.def || 0;
      shopCount[s.tok]++;
      log(`商店购买 ${opt.label}(-${price}金) @${conf.name}`);
      bought = true;
      break;
    }
    if (bought) continue;
    // 3c. 放宽战斗阈值
    if (tLevel < thresholds.length - 1) {
      tLevel++;
      log(`放宽战斗阈值 → 档位${tLevel}`);
      continue;
    }
    // 无计可施 → 失败诊断
    log("卡关：无可推进动作");
    const diag = previews.slice(0, 6).map((r) => {
      const md = D.MONSTERS[r.m.tok];
      return `  - ${md.name}@F${r.m.f + 1} 预计伤害 ${r.p.damage}（HP ${hero.hp}）`;
    });
    const doorDiag = sw.doors.map((d) => `  - ${d.tok}@F${d.f + 1}(${d.x},${d.y}) 钥匙 ${JSON.stringify(hero.keys)}`);
    return { win: false, hero, floorsLog, events, grids, fights, diag: [...diag, ...doorDiag] };
  }
  return { win: false, hero, floorsLog, events, grids, fights, diag: ["迭代上限，疑似死循环"] };
}

// ─────────────────────────────── 3. 报告输出 ───────────────────────────────

/** 职责：统计全塔资源总量（钥匙/门按色、药宝石装备、金币）。 */
function resourceAudit() {
  const cnt = {};
  for (const fl of D.FLOORS)
    for (const tok of fl.map.flatMap((r) => r.trim().split(/\s+/)))
      cnt[tok] = (cnt[tok] || 0) + 1;
  const gold = Object.entries(D.MONSTERS).reduce((s, [id, m]) => s + (cnt[id] || 0) * m.gold, 0);
  return { cnt, gold };
}

/** 职责：报告模拟结束后从未触达的实体格（潜在地图设计错误）。
 *  触达 = BFS 可达 或 位于交互边界（门/怪/NPC/商店可从相邻格交互）。 */
function unreachableTiles(grids) {
  const sw = sweep(grids, 0, findTok(grids[0], "st") || { x: 6, y: 10 });
  const touched = new Set(sw.reach);
  for (const list of [sw.doors, sw.monsters, sw.npcs, sw.shops])
    for (const r of list) touched.add(`${r.f},${r.x},${r.y}`);
  const bad = [];
  grids.forEach((grid, f) =>
    grid.forEach((row, y) =>
      row.forEach((tok, x) => {
        if (tok === "##") return;
        if (!touched.has(`${f},${x},${y}`)) {
          const info = D.tokenInfo(tok);
          if (info.type !== "floor") bad.push(`F${f + 1}(${x},${y}) ${tok}`);
        }
      })
    )
  );
  return bad;
}

const errs = validateStructure();
if (errs.length) {
  console.error("✗ 结构校验失败：");
  errs.forEach((e) => console.error("  - " + e));
  process.exit(1);
}
console.log("✓ 结构校验通过（13×13 / 外圈墙 / 令牌合法 / 楼梯起点配置正确）");

const { cnt, gold } = resourceAudit();
const keyLine = (k, d) => `${k}:${["ky", "kb", "kr"].map((t, i) => `${cnt[t] || 0}/${cnt[["dy", "db", "dr"][i]] || 0}`)[d]}`;
console.log(
  `✓ 资源账本  钥匙/门  黄 ${cnt.ky || 0}/${cnt.dy || 0}  蓝 ${cnt.kb || 0}/${cnt.db || 0}  红 ${cnt.kr || 0}/${cnt.dr || 0}` +
  `   金币产出 ${gold}`
);

const sim = simulate();
console.log(`\n${sim.win ? "✓ 贪心模拟通关成功" : "✗ 模拟未能通关"}   战斗 ${sim.fights} 场`);
console.log("\n楼层  首达时HP   攻   防   金币  钥匙(黄/蓝/红)");
for (const s of sim.floorsLog)
  console.log(
    `F${String(s.floor).padEnd(3)} ${String(s.hp).padStart(7)} ${String(s.atk).padStart(5)} ${String(s.def).padStart(5)}` +
    ` ${String(s.gold).padStart(6)}   ${s.keys.y}/${s.keys.b}/${s.keys.r}`
  );
console.log(
  `\n最终面板  HP ${sim.hero.hp}  攻 ${sim.hero.atk}  防 ${sim.hero.def}  金币 ${sim.hero.gold}` +
  `  余钥匙 ${sim.hero.keys.y}/${sim.hero.keys.b}/${sim.hero.keys.r}`
);

if (!sim.win) {
  console.error("\n卡关诊断：");
  (sim.diag || []).forEach((d) => console.error(d));
  process.exit(1);
}

const bad = unreachableTiles(sim.grids);
if (bad.length) {
  console.warn("\n⚠ 通关后仍不可达的实体格（检查地图设计）：");
  bad.forEach((b) => console.warn("  - " + b));
  process.exit(1);
}
console.log("✓ 全部实体格均可达（无死格）");
console.log("\n=== 数值验证全部通过 ===");
