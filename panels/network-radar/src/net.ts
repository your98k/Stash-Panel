// 网络工具：带超时的 fetch、并发池、IP 判定、国旗、打码。
import { AbortController, fetch } from "scripting"

export const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"

export type TextResult = { ok: boolean; status: number; text: string; ms: number }

export async function httpText(url: string, timeoutMs = 5000, extraHeaders: Record<string, string> = {}): Promise<TextResult> {
  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => {
    try {
      controller.abort()
    } catch (_) {}
  }, timeoutMs)

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": UA,
        Accept: "application/json,text/plain,text/html,*/*",
        "Cache-Control": "no-cache",
        ...extraHeaders,
      },
    })
    const text = await response.text()
    return { ok: response.ok, status: response.status, text, ms: Math.max(1, Date.now() - started) }
  } catch (_) {
    return { ok: false, status: 0, text: "", ms: Math.max(1, Date.now() - started) }
  } finally {
    clearTimeout(timer)
  }
}

export async function httpJson<T = any>(
  url: string,
  timeoutMs = 5000,
  headers: Record<string, string> = {}
): Promise<{ ok: boolean; status: number; data: T | null; ms: number }> {
  const result = await httpText(url, timeoutMs, headers)
  if (!result.text) return { ok: false, status: result.status, data: null, ms: result.ms }
  try {
    return { ok: result.status >= 200 && result.status < 300, status: result.status, data: JSON.parse(result.text) as T, ms: result.ms }
  } catch (_) {
    return { ok: false, status: result.status, data: null, ms: result.ms }
  }
}

/** 并发受限的 map，避免一次性打出几十个请求。 */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0

  const runners: Promise<void>[] = []
  const size = Math.max(1, Math.min(limit, items.length || 1))

  for (let i = 0; i < size; i += 1) {
    runners.push(
      (async () => {
        while (cursor < items.length) {
          const index = cursor
          cursor += 1
          results[index] = await worker(items[index], index)
        }
      })()
    )
  }

  await Promise.all(runners)
  return results
}

export function clean(value: unknown): string {
  if (value === null || value === undefined) return ""
  return String(value).trim()
}

const COUNTRY_NAMES: Record<string, string> = {
  中国: "CN",
  中国大陆: "CN",
  台湾: "TW",
  台湾省: "TW",
  香港: "HK",
  澳门: "MO",
  日本: "JP",
  韩国: "KR",
  新加坡: "SG",
  美国: "US",
  英国: "GB",
  德国: "DE",
  法国: "FR",
  荷兰: "NL",
  俄罗斯: "RU",
  加拿大: "CA",
  澳大利亚: "AU",
  印度: "IN",
  土耳其: "TR",
  越南: "VN",
  泰国: "TH",
  马来西亚: "MY",
  菲律宾: "PH",
  印度尼西亚: "ID",
  阿联酋: "AE",
  巴西: "BR",
  阿根廷: "AR",
  南非: "ZA",
  尼日利亚: "NG",
  巴基斯坦: "PK",
  乌克兰: "UA",
}

export function countryCode(value: unknown): string {
  const text = clean(value).toUpperCase()
  if (/^[A-Z]{2}$/.test(text)) return text
  const name = clean(value)
  if (!name) return ""
  for (const key of Object.keys(COUNTRY_NAMES)) {
    if (name.includes(key)) return COUNTRY_NAMES[key]
  }
  return ""
}

export function flagOf(cc: string): string {
  const code = countryCode(cc)
  if (!code) return ""
  // 中国大陆地区的 iOS 不渲染台湾地区旗帜（会显示成方框），直接留空
  if (code === "TW") return ""
  return String.fromCodePoint(...code.split("").map((char) => 127397 + char.charCodeAt(0)))
}

export function maskIP(ip: string): string {
  const value = clean(ip)
  if (!value) return value
  const parts = value.split(".")
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.*.*`
  const groups = value.split(":")
  if (groups.length > 2) return `${groups.slice(0, 2).join(":")}:***`
  return value
}

export function parseIPv4(ip: string): number[] | null {
  const parts = clean(ip).split(".")
  if (parts.length !== 4) return null
  const values = parts.map(Number)
  if (values.some((v) => !Number.isInteger(v) || v < 0 || v > 255)) return null
  return values
}

export function isPrivateIPv4(ip: string): boolean {
  const parts = parseIPv4(ip)
  if (!parts) return false
  return (
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  )
}

export function isCGNATIPv4(ip: string): boolean {
  const parts = parseIPv4(ip)
  return Boolean(parts && parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
}

export function isPublicIPv4(ip: string): boolean {
  const parts = parseIPv4(ip)
  if (!parts) return false
  return (
    !isPrivateIPv4(ip) &&
    !isCGNATIPv4(ip) &&
    parts[0] !== 0 &&
    parts[0] !== 127 &&
    parts[0] < 224 &&
    !(parts[0] === 169 && parts[1] === 254)
  )
}

export function detectNAT(_localIP: string, _exitIP: string): string {
  // 没有 STUN/映射行为测试，IP 地址不能证明 NAT 类型。
  return "未知"
}

export function shortCarrier(value: string): string {
  const text = clean(value)
  if (!text) return ""
  if (/移动|cmcc|china mobile/i.test(text)) return "中国移动"
  if (/联通|unicom/i.test(text)) return "中国联通"
  if (/电信|telecom|chinanet/i.test(text)) return "中国电信"
  if (/广电|broadnet/i.test(text)) return "中国广电"
  if (/教育|edu\.cn/i.test(text)) return "教育网"
  if (/阿里|alibaba|aliyun/i.test(text)) return "阿里云"
  if (/腾讯|tencent/i.test(text)) return "腾讯云"
  return text.length > 14 ? text.slice(0, 14) : text
}

export function timeLabel(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function agoLabel(ts: number): string {
  if (!ts) return "从未"
  const diff = Date.now() - ts
  if (diff < 60_000) return "刚刚"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return `${Math.floor(diff / 86_400_000)} 天前`
}
