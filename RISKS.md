# RISKS — 风险台账

> 若风险状态变化，请更新本文件。

| # | 风险 | 触发条件 | 现状与预案 | 回滚点 |
|---|------|----------|-----------|--------|
| R1 | 数值不可通关 | 修改 `data.js` 后未验证 | **已闭环**：`npm run check` 全塔模拟到击败魔王，失败退出码 1；任何数值改动必须先过验证器 | data.js 上一版 |
| R2 | 玩家把资源花错导致卡关 | 极端乱花钥匙/血量 | 设计侧：黄钥匙供给 27 > 门 22，蓝/红恰好平衡且集中主线；钥匙商店兜底；致死战斗拦截；三槽存档 + 每层自动存档可回退 | 读取自动档 |
| R3 | 贪心模拟 ≠ 最优解，验证非全状态空间 | 理论上存在贪心过不去但人能过去的塔（反之亦然） | 接受的工程取舍：贪心策略模拟"稳健玩家"，通过即证明存在稳健通关路线（充分性成立，见 PLAN.md 关键取舍） | — |
| R4 | file:// 协议兼容 | 双击 index.html 直接打开 | 全部脚本为普通 script（非 ES module），无 fetch/无外部资源，实测可玩；音效在首次交互后初始化符合自动播放策略 | 使用 `npm run dev` 起服务 |
| R5 | localStorage 不可用（隐私模式） | 无痕窗口存档失败 | save() 已 try/catch 并提示"存档失败"，游戏本体不受影响 | — |
| R6 | 触屏无键盘 | 手机访问 | `(pointer: coarse)` 自动显示屏幕方向键，支持长按连走 | — |
| R7 | 浏览器自动化测试遗留数据 | 实测产生的存档污染玩家首次体验 | 已在测试收尾清空 `mota_*` localStorage（且部署域与本地域隔离，线上无此问题） | — |
| R8 | Vercel CLI 无登录凭据 | `vercel deploy` 进入设备授权流程，需人工登录 | **降级执行**：改用已登录的 GitHub CLI 部署 GitHub Pages（https://ledondev520.github.io/mota-tower/），线上已实测可玩；若仍需 Vercel，运行 `vercel login` 后在项目目录执行 `vercel deploy --prod -y` 即可 | GitHub Pages 已可用 |
| R9 | Pages 自动部署工作流偶发失败 | push 后 `pages build and deployment` 在 deploy 步骤报"Deployment failed, try again later"（GitHub 服务端瞬时故障，重跑同样失败） | **已验证的绕行**：`gh api -X POST repos/<owner>/<repo>/pages/builds` 强制触发 legacy 构建，20 秒内 built 并上线；push 后若线上未更新按此处理 | 线上保留上一成功版本，无停机 |
| R10 | 存档码被手工篡改或截断 | 导入非法/损坏的码 | savecode 解码失败即 reject，引擎 hydrate 校验 hero/pos 缺失抛错，UI toast"导入失败"，不影响当前进度 | 现有 localStorage 存档不受影响 |
