// 收藏列表: 这个 Worker 上一份, 存在 KV。
// 没有登录、没有同步码。打开页面的人都能读改同一份列表 —— 给自己部署的实例用。

import { inRange } from "./parse.js";

const KV_KEY = "favorites";

export function normalizeFavs(list) {
  if (!Array.isArray(list)) throw new Error("收藏列表格式错误");
  const favs = [];
  for (const item of list) {
    if (!item || typeof item !== "object") throw new Error("收藏项无效");
    const name = String(item.name || "").trim() || "未命名";
    const lat = Number(item.lat);
    const lon = Number(item.lon);
    if (!inRange(lat, lon)) throw new Error("收藏坐标超出合法范围");
    const time = typeof item.time === "string" ? item.time.slice(0, 40) : "";
    favs.push({ name, lat, lon, time });
  }
  return favs;
}

export async function readFavorites(kv) {
  const raw = await kv.get(KV_KEY);
  if (!raw) return [];
  try {
    return normalizeFavs(JSON.parse(raw));
  } catch (e) {
    return [];
  }
}

export async function writeFavorites(kv, list) {
  const favs = normalizeFavs(list);
  if (favs.length === 0) await kv.delete(KV_KEY);
  else await kv.put(KV_KEY, JSON.stringify(favs));
  return favs;
}
