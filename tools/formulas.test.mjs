/**
 * formulas.test.mjs — 战斗公式单元测试（node --test）
 *
 * Input : ../js/formulas.js（经 vm 加载）
 * Output: node:test 用例；`npm test` 执行
 * Pos   : 保障公式模块行为不回归的最小防线。
 * 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * 职责：把浏览器风格的普通脚本加载进隔离上下文并取出全局导出。
 * 参数：rel 相对本文件的脚本路径。
 * 返回值：脚本执行后的上下文对象。
 */
function loadScript(rel, ctx = {}) {
  const src = readFileSync(join(here, rel), "utf8");
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx;
}

const { MOTA_FORMULAS: F } = loadScript("../js/formulas.js");

test("普通怪：勇士先手，最后一击后怪物不反击", () => {
  // 勇士每击 10-1=9，绿色史莱姆 35HP → 4 击；反击 3 轮 × (18-10)=8 → 24
  const p = F.battlePreview({ atk: 10, def: 10, hp: 1000 }, { hp: 35, atk: 18, def: 1 });
  assert.equal(p.win, true);
  assert.equal(p.rounds, 4);
  assert.equal(p.damage, 24);
});

test("攻击不破防：判负且伤害无穷", () => {
  const p = F.battlePreview({ atk: 10, def: 10, hp: 1000 }, { hp: 35, atk: 18, def: 10 });
  assert.equal(p.win, false);
  assert.equal(p.damage, Infinity);
});

test("怪物攻击不破勇士防：零伤害胜利", () => {
  const p = F.battlePreview({ atk: 100, def: 50, hp: 1000 }, { hp: 90, atk: 40, def: 10 });
  assert.equal(p.win, true);
  assert.equal(p.damage, 0);
});

test("先攻：怪物多打一轮", () => {
  const base = F.battlePreview({ atk: 20, def: 10, hp: 1000 }, { hp: 40, atk: 30, def: 0 });
  const first = F.battlePreview(
    { atk: 20, def: 10, hp: 1000 },
    { hp: 40, atk: 30, def: 0, ability: ["first"] }
  );
  assert.equal(first.damage - base.damage, 30 - 10);
});

test("魔攻：无视勇士防御", () => {
  const p = F.battlePreview(
    { atk: 20, def: 999, hp: 1000 },
    { hp: 40, atk: 30, def: 0, ability: ["magic"] }
  );
  // 2 击杀，反击 1 轮 × 30（无视防御）
  assert.equal(p.damage, 30);
});

test("连击：每轮伤害翻倍", () => {
  const p = F.battlePreview(
    { atk: 20, def: 10, hp: 1000 },
    { hp: 40, atk: 30, def: 0, ability: ["double"] }
  );
  // 2 击杀，反击 1 轮 × (30-10)×2 = 40
  assert.equal(p.damage, 40);
});

test("canWin：伤害等于 HP 判死，不允许", () => {
  const hero = { atk: 20, def: 10, hp: 20 };
  const m = { hp: 40, atk: 30, def: 0 }; // 伤害 20
  assert.equal(F.canWin(hero, m), false);
  assert.equal(F.canWin({ ...hero, hp: 21 }, m), true);
});

test("商店递增定价", () => {
  assert.equal(F.shopPrice(25, 25, 0), 25);
  assert.equal(F.shopPrice(25, 25, 3), 100);
});
