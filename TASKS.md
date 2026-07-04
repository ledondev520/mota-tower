# TASKS — 魔塔 · Mota

> 状态流转：TODO → DOING → DONE。若任务结构变化，请同步更新本文件与 PLAN.md。

| ID | 任务 | 预计 | 状态 | 验收 |
|----|------|------|------|------|
| T1 | 设计拆解 + 技术方案（sequential-thinking / context7） | 15m | DONE | PLAN.md 定稿 |
| T2 | 项目骨架：PLAN/TASKS/package.json/目录 | 10m | DONE | 文件就绪 |
| T3 | `js/formulas.js` 战斗公式 + `tools/formulas.test.mjs` | 15m | DONE | `npm test` 8/8 绿灯 |
| T4 | `js/data.js` 怪物表/道具/15 层地图/商店/NPC | 60m | DONE | 结构校验通过 |
| T5 | `tools/balance_check.mjs` 验证器 + 数值迭代（6 轮） | 45m | DONE | `npm run check` 通关，曲线见 METRICS |
| T6 | `js/sprites.js` 程序化像素画 | 45m | DONE | RESULTS/02 截图目检 |
| T7 | `js/engine.js` 引擎（移动/战斗/门/楼梯/存档/事件） | 40m | DONE | 浏览器实测正常 |
| T8 | `js/ui.js` + `js/audio.js` + `index.html` + `style.css` | 50m | DONE | 完整 UI 可玩 |
| T9 | 浏览器实测（自动通关 + 交互抽测 + 截图证据） | 30m | DONE | RESULTS/01–08 截图 |
| T10 | 文档：README / RISKS / METRICS / RESULTS | 20m | DONE | 文档齐备 |
| T11 | 线上部署 + 验证（Vercel 未登录 → 改用 GitHub Pages，见 RISKS R8） | 10m | DONE | https://ledondev520.github.io/mota-tower/ 实测可玩 |
| T12 | interactive_feedback 收集反馈 | 5m | DONE | 已调用（等待超时，未收到反馈；后续反馈随时可继续迭代） |

## 第二轮：手机端与跨浏览器存档（用户反馈驱动）

| ID | 任务 | 预计 | 状态 | 验收 |
|----|------|------|------|------|
| T13 | `js/savecode.js` 存档码编解码 + 地图差异 + 单测 | 20m | DONE | `npm test` 11/11 绿灯 |
| T14 | 引擎升级：v2 差异式存档 / loadLatest / 导入导出 / 高频自动存档 | 20m | DONE | 浏览器往返实测一致 |
| T15 | 触屏操控：虚拟摇杆 + 方向键（可切换）+ 快捷圆钮 | 25m | DONE | 合成指针实测连走正常 |
| T16 | 移动端布局：紧凑 HUD / 地图自适应 / safe-area | 15m | DONE | 390×844 视口截图 RESULTS/09–10 |
| T17 | 标题页：继续冒险读最新档 + 摘要 + 导入存档入口 | 10m | DONE | 实测摘要与读档正确 |
| T18 | 文档同步 + 部署上线 + 线上复验 | 15m | DONE | GitHub Pages 更新可玩 |

## 执行备注

- T3→T4→T5 为关键路径（先把数值调绿再做表现层，降低返工）。
- T6 与 T5 数值迭代互不依赖，可穿插。
- 第二轮 T13（存档格式）先行，因 T14/T17 依赖其接口；操控（T15/T16）与其并行。
