/**
 * savecode.js — 跨浏览器存档码（压缩 + base64url 编解码，纯函数）
 *
 * Input : Web 标准 API（TextEncoder/Blob/Response/CompressionStream，Node 22 同样原生支持）
 * Output: 全局对象 MOTA_SAVECODE = { encode, decode, buildDiff, applyDiff }
 *         encode/decode 为异步（压缩流）；diff 工具供 engine 生成紧凑存档。
 * Pos   : 存档的"编解码器"——把游戏状态变成可复制/下载的短字符串，
 *         使记录能在不同浏览器/设备间迁移；不持有任何游戏状态。
 * 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 *
 * 存档码格式：
 *   "MOTA2."  + base64url(deflate(JSON))   —— 支持压缩流的环境
 *   "MOTA2R." + base64url(JSON)            —— 降级明文（仍可跨端导入）
 */
(function (root) {
  "use strict";

  /** 职责：Uint8Array → base64url（无填充，URL/剪贴板安全）。 */
  function toB64url(bytes) {
    var bin = "";
    for (var i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  /** 职责：base64url → Uint8Array。 */
  function fromB64url(s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    var bin = atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /** 职责：经压缩/解压流管道处理字节。参数 kind: "deflate" 方向由 ctor 决定。 */
  function pipe(bytes, Ctor) {
    var stream = new Blob([bytes]).stream().pipeThrough(new Ctor("deflate"));
    return new Response(stream).arrayBuffer().then(function (buf) {
      return new Uint8Array(buf);
    });
  }

  /**
   * 职责：把 JSON 字符串编码为存档码。
   * 思路：优先 deflate 压缩（体积约 1/6），环境不支持则降级明文 base64url。
   * 参数：jsonStr 已序列化的存档 JSON。
   * 返回值：Promise<string> 存档码。
   */
  function encode(jsonStr) {
    var raw = new TextEncoder().encode(jsonStr);
    if (typeof CompressionStream === "undefined") {
      return Promise.resolve("MOTA2R." + toB64url(raw));
    }
    return pipe(raw, CompressionStream).then(function (c) {
      return "MOTA2." + toB64url(c);
    });
  }

  /**
   * 职责：把存档码解码回 JSON 字符串。
   * 参数：code 存档码（容忍首尾空白/换行）。
   * 返回值：Promise<string>；格式非法时 reject。
   */
  function decode(code) {
    code = String(code || "").replace(/\s+/g, "");
    if (code.indexOf("MOTA2R.") === 0) {
      return Promise.resolve(new TextDecoder().decode(fromB64url(code.slice(7))));
    }
    if (code.indexOf("MOTA2.") === 0) {
      if (typeof DecompressionStream === "undefined") {
        return Promise.reject(new Error("当前浏览器不支持压缩存档码，请更换浏览器导入"));
      }
      return pipe(fromB64url(code.slice(6)), DecompressionStream).then(function (b) {
        return new TextDecoder().decode(b);
      });
    }
    return Promise.reject(new Error("存档码格式不正确（应以 MOTA2 开头）"));
  }

  /**
   * 职责：对比当前地图与初始地图，生成紧凑差异表。
   * 参数：pristine / grids 均为 [floor][y][x] 令牌矩阵。
   * 返回值：{ "f,y,x": tok } 仅含被改变的格子。
   */
  function buildDiff(pristine, grids) {
    var d = {};
    for (var f = 0; f < grids.length; f++)
      for (var y = 0; y < grids[f].length; y++)
        for (var x = 0; x < grids[f][y].length; x++)
          if (grids[f][y][x] !== pristine[f][y][x]) d[f + "," + y + "," + x] = grids[f][y][x];
    return d;
  }

  /**
   * 职责：把差异表应用到初始地图副本上，重建完整地图。
   * 参数：pristine 初始矩阵（不被修改）；diff buildDiff 的产物。
   * 返回值：新的 [floor][y][x] 矩阵。
   */
  function applyDiff(pristine, diff) {
    var grids = pristine.map(function (fl) {
      return fl.map(function (row) { return row.slice(); });
    });
    Object.keys(diff || {}).forEach(function (k) {
      var p = k.split(",");
      grids[+p[0]][+p[1]][+p[2]] = diff[k];
    });
    return grids;
  }

  root.MOTA_SAVECODE = {
    encode: encode,
    decode: decode,
    buildDiff: buildDiff,
    applyDiff: applyDiff,
  };
})(typeof window !== "undefined" ? window : globalThis);
