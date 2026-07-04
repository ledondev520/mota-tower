/**
 * main.js — 启动入口
 *
 * Input : MOTA_UI（表现层总装）
 * Output: 页面加载完成后调用 MOTA_UI.boot()
 * Pos   : 模块装配的最后一环，无任何业务逻辑。
 * 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
(function () {
  "use strict";
  /** 职责：DOM 就绪后启动游戏 UI。 */
  function start() { window.MOTA_UI.boot(); }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
