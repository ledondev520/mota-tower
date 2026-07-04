/**
 * formulas.js — 魔塔战斗数学（纯函数，无副作用）
 *
 * Input : 无依赖（纯计算模块）
 * Output: 全局对象 MOTA_FORMULAS = { battlePreview, canWin, shopPrice }
 *         浏览器挂在 window，Node（vm/globalThis）下挂在 globalThis，供
 *         engine.js / ui.js / tools/balance_check.mjs 三端复用同一套公式。
 * Pos   : 局部系统的最底层——战斗与商店定价的唯一真相来源；
 *         任何数值规则修改必须且只能发生在这里。
 * 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
(function (root) {
  "use strict";

  /**
   * 职责：计算一场战斗的完整预览（能否胜利、承受伤害、回合数）。
   * 思路：
   *   1. 勇士每击伤害 pd = atk - 怪物def；pd<=0 则永远打不死，判负。
   *   2. 击杀所需勇士出手次数 rounds = ceil(怪物hp / pd)。
   *   3. 怪物反击次数 = rounds - 1（勇士先手，最后一击后怪物已死）；
   *      若怪物有「先攻」，反击次数 +1（等效怪物先打一轮）。
   *   4. 怪物每轮伤害 md：普通 = max(0, 怪物atk - 勇士def)；
   *      「魔攻」无视防御 md = 怪物atk；「连击」每轮打两次 md ×2。
   * 参数：
   *   hero    {atk, def, hp} —— 勇士当前面板（hp 仅用于 lethal 判断）。
   *   monster {hp, atk, def, ability} —— ability 为字符串数组，
   *           可含 "first"(先攻) / "magic"(魔攻) / "double"(连击)。
   * 返回值：{ win, damage, rounds, perHit }
   *   win    能否战胜（伤害可能仍致死，由调用方用 damage>=hero.hp 判断）；
   *   damage 战斗承受总伤害（win=false 时为 Infinity）；
   *   rounds 勇士出手次数；perHit 勇士每击伤害。
   */
  function battlePreview(hero, monster) {
    var ab = monster.ability || [];
    var pd = hero.atk - monster.def; // 勇士每击
    if (pd <= 0) {
      return { win: false, damage: Infinity, rounds: Infinity, perHit: 0 };
    }
    var rounds = Math.ceil(monster.hp / pd);
    var strikes = rounds - 1; // 怪物反击轮数
    if (ab.indexOf("first") >= 0) strikes += 1;
    var md = Math.max(0, monster.atk - hero.def); // 怪物每轮
    if (ab.indexOf("magic") >= 0) md = monster.atk;
    if (ab.indexOf("double") >= 0) md *= 2;
    return { win: true, damage: strikes * md, rounds: rounds, perHit: pd };
  }

  /**
   * 职责：判断此刻开战是否能活着赢（胜利且战后 HP ≥ 1）。
   * 参数：hero / monster 同 battlePreview。
   * 返回值：boolean。
   */
  function canWin(hero, monster) {
    var p = battlePreview(hero, monster);
    return p.win && p.damage < hero.hp;
  }

  /**
   * 职责：计算商店第 n 次购买的价格（递增定价，防无限刷属性）。
   * 思路：价格 = base + step × 已购次数，线性透明、玩家易于规划。
   * 参数：base 基础价；step 每次购买后的涨幅；count 该商店已购买次数。
   * 返回值：本次购买价格（整数金币）。
   */
  function shopPrice(base, step, count) {
    return base + step * count;
  }

  root.MOTA_FORMULAS = {
    battlePreview: battlePreview,
    canWin: canWin,
    shopPrice: shopPrice,
  };
})(typeof window !== "undefined" ? window : globalThis);
