import { Hono } from "hono/tiny";
import { getPageHtml } from "./page.js";
import { parseCoords, gcj02ToWgs84, toWgs84, round6, inRange } from "./parse.js";
import { readFavorites, writeFavorites } from "./favorites.js";
import {
  AUTH_COOKIE,
  authToken,
  equal,
  gateEnabled,
  getLoginHtml,
  isAuthed,
  makeAuthCookie,
  readPostedPassword,
  sitePassword,
} from "./auth.js";

const app = new Hono();

// 解析请求可能包含位置；明确禁止浏览器和共享缓存存储 API 响应。
app.use('/api/*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  await next();
});

function corsJson(c, body, status) {
  c.header("Access-Control-Allow-Origin", "*");
  return c.json(body, status || 200);
}

// 设了 CLOUDFLARE_ACCOUNT_PASSWORD 就要进门。/api/parse 留给快捷指令, 不挡。
app.use("*", async (c, next) => {
  if (!gateEnabled(c.env)) return next();
  const path = new URL(c.req.url).pathname;
  if (path === "/login" || path === "/api/parse") return next();
  if (await isAuthed(c, sitePassword(c.env))) return next();
  if (path.startsWith("/api/")) return corsJson(c, { error: "未登录" }, 401);
  return c.html(getLoginHtml(false));
});

app.get("/login", (c) => c.html(getLoginHtml(false)));

app.post("/login", async (c) => {
  if (!gateEnabled(c.env)) return c.redirect("/");
  const pw = sitePassword(c.env);
  const posted = await readPostedPassword(c);
  if (!equal(posted, pw)) return c.html(getLoginHtml(true));
  c.header("Set-Cookie", makeAuthCookie(await authToken(pw), c));
  return c.redirect("/");
});

app.get("/", (c) => {
  return c.html(getPageHtml());
});

// 解析地图链接: 供快捷指令调用。
// GET /api/parse?u=<链接>&format=json&cs=<gcj|none>
//   返回 {lat, lon, name}; 高德/苹果地图(中国大陆均为 GCJ-02)自动转 WGS84; 境外坐标自动跳过(out_of_china)。cs=none 可强制不转换。
//   不带 format=json 时返回纯文本 "lat=..&lon=.." 片段。
app.get("/api/parse", async (c) => {
  const raw = c.req.query("u") || "";
  const cs = (c.req.query("cs") || "").toLowerCase();
  const fmt = (c.req.query("format") || "").toLowerCase();
  try {
    let { lat, lon, name, src } = await parseCoords(raw);
    // 默认按来源自动换算; cs=none 强制不转换, cs=gcj/bd 强制按指定坐标系转换。
    if (cs === "gcj") ({ lat, lon } = gcj02ToWgs84(lat, lon));
    else if (cs === "bd") ({ lat, lon } = toWgs84(lat, lon, "baidu"));
    else if (cs !== "none") ({ lat, lon } = toWgs84(lat, lon, src));
    // 出口再校验一次: cs= 是调用方指定的, 强行按错误坐标系换算也可能把值推出值域。
    // 宁可报错也不要返回一个能被当成坐标写进设备的数字。
    if (!inRange(lat, lon)) throw new Error("解析出的坐标超出合法范围");
    lat = round6(lat);
    lon = round6(lon);
    name = name || "";
    c.header("Access-Control-Allow-Origin", "*");
    if (fmt === "json") return c.json({ lat, lon, name });
    return c.text(`lat=${lat}&lon=${lon}`);
  } catch (e) {
    c.header("Access-Control-Allow-Origin", "*");
    return c.json({ error: String(e && e.message ? e.message : e) }, 422);
  }
});

// 收藏: 这个 Worker 上一份列表。没有绑定 FAVORITES 时返回 501, 页面回退到 localStorage。
app.get("/api/favorites", async (c) => {
  const kv = c.env && c.env.FAVORITES;
  if (!kv) return corsJson(c, { error: "未配置收藏存储 (KV)" }, 501);
  const favs = await readFavorites(kv);
  return corsJson(c, { favs });
});

app.post("/api/favorites", async (c) => {
  const kv = c.env && c.env.FAVORITES;
  if (!kv) return corsJson(c, { error: "未配置收藏存储 (KV)" }, 501);
  let body;
  try {
    body = await c.req.json();
  } catch (e) {
    return corsJson(c, { error: "无效 JSON" }, 422);
  }
  try {
    const favs = await writeFavorites(kv, body && body.favs);
    return corsJson(c, { favs });
  } catch (e) {
    return corsJson(c, { error: String(e && e.message ? e.message : e) }, 422);
  }
});

// 兜底 500 也要带 CORS —— 否则快捷指令那边看到的是跨域错误, 而不是真正的原因。
app.onError((e, c) => {
  c.header("Access-Control-Allow-Origin", "*");
  return c.text(`${e && e.message ? e.message : e}`, 500);
});

export default app;
