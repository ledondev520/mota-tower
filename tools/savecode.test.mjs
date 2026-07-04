/**
 * savecode.test.mjs — 存档码编解码与地图差异单元测试（node --test）
 *
 * Input : ../js/savecode.js（经 vm 加载，注入 Web 标准全局）
 * Output: node:test 用例；`npm test` 执行
 * Pos   : 保障跨浏览器存档往返一致性的最小防线。
 * 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));

/** 职责：加载浏览器风格脚本并注入 Web 标准全局（Node 22 原生具备）。 */
function loadScript(rel) {
  const ctx = {
    TextEncoder, TextDecoder, Blob, Response, btoa, atob, Uint8Array, Promise,
    CompressionStream: globalThis.CompressionStream,
    DecompressionStream: globalThis.DecompressionStream,
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(here, rel), "utf8"), ctx);
  return ctx;
}

const { MOTA_SAVECODE: SC } = loadScript("../js/savecode.js");

test("存档码：压缩往返一致且明显变短", async () => {
  const obj = {
    v: 2,
    hero: { hp: 4522, atk: 188, def: 161, gold: 11, keys: { y: 5, b: 0, r: 0 } },
    diff: Object.fromEntries(
      Array.from({ length: 260 }, (_, i) => [`${i % 15},${(i * 7) % 13},${(i * 3) % 13}`, ".."])
    ),
    visited: Array.from({ length: 15 }, (_, i) => i),
  };
  const json = JSON.stringify(obj);
  const code = await SC.encode(json);
  assert.match(code, /^MOTA2R?\./);
  const back = await SC.decode(code);
  assert.deepEqual(JSON.parse(back), obj);
  if (code.startsWith("MOTA2.")) {
    assert.ok(code.length < json.length, `压缩后应更短: ${code.length} < ${json.length}`);
  }
});

test("存档码：容忍换行空白，拒绝非法格式", async () => {
  const code = await SC.encode('{"a":1}');
  const noisy = code.slice(0, 10) + "\n  " + code.slice(10) + "\n";
  assert.equal(await SC.decode(noisy), '{"a":1}');
  await assert.rejects(() => SC.decode("HELLO.abc"), /格式不正确/);
});

/** vm 与宿主分属不同 realm，原型不同，故一律 JSON 归一化后比较。 */
const norm = (v) => JSON.parse(JSON.stringify(v));

test("地图差异：buildDiff/applyDiff 往返一致", () => {
  const pristine = [[["..", "##"], ["ky", ".."]], [["dn", ".."], ["..", "bo"]]];
  const grids = SC.applyDiff(pristine, {});
  grids[0][1][0] = ".."; // 捡走钥匙
  grids[1][1][1] = ".."; // 击杀魔王
  const diff = SC.buildDiff(pristine, grids);
  assert.deepEqual(norm(diff), { "0,1,0": "..", "1,1,1": ".." });
  assert.deepEqual(norm(SC.applyDiff(pristine, diff)), norm(grids));
  // pristine 不被 applyDiff 污染
  assert.equal(pristine[0][1][0], "ky");
});
