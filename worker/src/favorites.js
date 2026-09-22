// 收藏列表: 按同步码存在 KV, 不跟设备账号绑定。
// 同步码是 16 位十六进制(64 bit), 持有它就能读写那份列表 —— 这是有意做成
// 无登录可换浏览器, 不是访问控制。不要把同步码发到公开场合。

import { inRange } from "./parse.js";

export const FAV_ID_RE = /^[0-9a-f]{16}$/i;
export const MAX_FAVORITES = 100;
export const MAX_NAME_LEN = 30;

export function isFavId(id) {
  return FAV_ID_RE.test(String(id || ""));
}

function kvKey(id) {
  return `fav:${String(id).toLowerCase()}`;
}

export function normalizeFavs(list) {
  if (!Array.isArray(list)) throw new Error("收藏列表格式错误");
  if (list.length > MAX_FAVORITES) throw new Error("收藏最多 100 条");
  const favs = [];
  for (const item of list) {
    if (!item || typeof item !== "object") throw new Error("收藏项无效");
    const name = String(item.name || "").trim();
    if (!name) throw new Error("收藏名称不能为空");
    if (name.length > MAX_NAME_LEN) throw new Error("收藏名称过长");
    const lat = Number(item.lat);
    const lon = Number(item.lon);
    if (!inRange(lat, lon)) throw new Error("收藏坐标超出合法范围");
    const time = typeof item.time === "string" && item.time.length <= 40 ? item.time : "";
    favs.push({ name, lat, lon, time });
  }
  return favs;
}

export async function readFavorites(kv, id) {
  const raw = await kv.get(kvKey(id));
  if (!raw) return [];
  try {
    return normalizeFavs(JSON.parse(raw));
  } catch (e) {
    return [];
  }
}

export async function writeFavorites(kv, id, list) {
  const favs = normalizeFavs(list);
  const key = kvKey(id);
  if (favs.length === 0) await kv.delete(key);
  else await kv.put(key, JSON.stringify(favs));
  return favs;
}
