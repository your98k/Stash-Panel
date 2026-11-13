// 本机自测：出口 IP / 纯净度 / 延迟 / QUIC / 流媒体 / AI 可用性。
// 与 Surge 版逻辑保持一致，只是无法按策略组分别打点（那需要 Surge 的 policy 能力）。
import { Device } from "scripting"
import {
  clean,
  countryCode,
  detectNAT,
  httpJson,
  httpText,
  mapLimit,
  shortCarrier,
} from "./net"
import type { ExitInfo, LocalInfo, ServiceInfo, Snapshot } from "./types"
import { EMPTY_EXIT, EMPTY_LOCAL } from "./types"

const GLOBAL_LATENCY_URLS = [
  "https://cp.cloudflare.com/generate_204",
  "https://www.gstatic.com/generate_204",
  "https://www.google.com/generate_204",
]

const MAINLAND_LATENCY_URLS = [
  "http://connect.rom.miui.com/generate_204",
  "http://wifi.vivo.com.cn/generate_204",
  "https://www.baidu.com/favicon.ico",
  "https://www.qq.com/favicon.ico",
]

const QUIC_TRACE_URLS = [
  "https://cloudflare-quic.com/cdn-cgi/trace",
  "https://cloudflare.com/cdn-cgi/trace",
]

export type ServiceDef = { id: string; name: string; url: string }

export const MEDIA_SERVICES: ServiceDef[] = [
  { id: "netflix", name: "Netflix", url: "https://www.netflix.com/title/81215567" },
  { id: "disney", name: "Disney+", url: "https://www.disneyplus.com/" },
  { id: "spotify", name: "Spotify", url: "https://open.spotify.com/" },
  { id: "tiktok", name: "TikTok", url: "https://www.tiktok.com/" },
  { id: "youtube", name: "YouTube", url: "https://www.youtube.com/" },
  { id: "prime", name: "Prime", url: "https://www.primevideo.com/" },
]

export const AI_SERVICES: ServiceDef[] = [
  { id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com/" },
  { id: "claude", name: "Claude", url: "https://claude.ai/" },
  { id: "gemini", name: "Gemini", url: "https://gemini.google.com/" },
  { id: "deepseek", name: "DeepSeek", url: "https://chat.deepseek.com/" },
  { id: "grok", name: "Grok", url: "https://grok.com/" },
  { id: "perplexity", name: "Perplexity", url: "https://www.perplexity.ai/" },
]

type Flags = {
  proxy: boolean
  vpn: boolean
  tor: boolean
  abuser: boolean
  hosting: boolean
  datacenter: boolean
  mobile: boolean
  residential: boolean
}

const EMPTY_FLAGS: Flags = {
  proxy: false,
  vpn: false,
  tor: false,
  abuser: false,
  hosting: false,
  datacenter: false,
  mobile: false,
  residential: false,
}

function classifyKind(flags: Flags): string {
  if (flags.mobile) return "移动网络"
  if (flags.residential) return "住宅 IP"
  if (flags.datacenter || flags.hosting) return "商业机房"
  if (flags.proxy || flags.vpn) return "住宅 IP"
  return "未知网络"
}

function purityScore(flags: Flags, kind: string): number {
  let score = kind === "住宅 IP" || kind === "移动网络" ? 92 : kind === "商业机房" ? 78 : 72
  const proxyVpn = (flags.proxy ? 1 : 0) + (flags.vpn ? 1 : 0)

  if (flags.tor) score -= 55
  if (flags.abuser) score -= 35
  if (proxyVpn >= 2) score -= 30
  else if (proxyVpn === 1) score -= 16
  if (kind === "商业机房" || flags.datacenter || flags.hosting) score -= 8
  if ((kind === "住宅 IP" || kind === "移动网络") && !flags.proxy && !flags.vpn && !flags.tor && !flags.abuser) {
    score += 3
  }

  return Math.max(0, Math.min(100, Math.round(score)))
}

function riskLevel(flags: Flags, score: number): string {
  const proxyVpn = (flags.proxy ? 1 : 0) + (flags.vpn ? 1 : 0)
  if (flags.tor || flags.abuser || score < 45 || (proxyVpn >= 2 && score < 60)) return "高风险"
  if (score < 75 || flags.datacenter || flags.hosting || proxyVpn > 0) return "中风险"
  return "低风险"
}

async function collectExit(): Promise<ExitInfo> {
  const stamp = Date.now()
  const [ipApi, ipWho, ipApiIs, ipInfo] = await Promise.all([
    httpJson(
      `http://ip-api.com/json/?lang=zh-CN&fields=status,message,query,country,countryCode,regionName,city,isp,org,as,asname,proxy,hosting,mobile&_=${stamp}`,
      4000
    ),
    httpJson(`https://ipwho.is/?lang=zh-CN&_=${stamp}`, 4000),
    httpJson(`https://api.ipapi.is/?_=${stamp}`, 4000),
    httpJson(`https://ipinfo.io/json?_=${stamp}`, 4000),
  ])

  const a: any = ipApi.data || null
  const b: any = ipWho.data || null
  const c: any = ipApiIs.data || null
  const d: any = ipInfo.data || null

  if (a && a.status && a.status !== "success") {
    // ip-api 被限流时忽略该源
  }

  const flags: Flags = { ...EMPTY_FLAGS }

  const ip = clean(a?.query) || clean(b?.ip) || clean(c?.ip) || clean(d?.ip)
  const cc =
    countryCode(a?.countryCode) ||
    countryCode(b?.country_code) ||
    countryCode(c?.location?.country_code) ||
    countryCode(d?.country)
  const country = clean(a?.country) || clean(b?.country) || clean(c?.location?.country)
  const region = clean(a?.regionName) || clean(b?.region) || clean(c?.location?.state) || clean(d?.region)
  const city = clean(a?.city) || clean(b?.city) || clean(c?.location?.city) || clean(d?.city)

  let isp = clean(a?.isp) || clean(b?.connection?.isp) || clean(b?.connection?.org) || clean(c?.company?.name)
  let org = clean(a?.org) || clean(b?.connection?.org) || clean(c?.asn?.org)
  let asn = clean(a?.as) || (b?.connection?.asn ? `AS${b.connection.asn}` : "") || (c?.asn?.asn ? `AS${c.asn.asn}` : "")

  if (!asn && clean(d?.org)) {
    const matched = clean(d.org).match(/^(AS\d+)\s+(.*)$/)
    if (matched) {
      asn = matched[1]
      org = org || matched[2]
    } else {
      org = org || clean(d.org)
    }
  }

  if (!isp) isp = org

  if (a) {
    flags.proxy = flags.proxy || a.proxy === true
    flags.hosting = flags.hosting || a.hosting === true
    flags.mobile = flags.mobile === true
  }
  if (c) {
    flags.mobile = flags.mobile || c.is_mobile === true
    flags.datacenter = flags.datacenter || c.is_datacenter === true
    flags.proxy = flags.proxy || c.is_proxy === true
    flags.vpn = flags.vpn || c.is_vpn === true
    flags.tor = flags.tor || c.is_tor === true
    flags.abuser = flags.abuser || c.is_abuser === true
  }

  if (!ip) return { ...EMPTY_EXIT }

  flags.residential =
    !flags.datacenter && !flags.hosting && !flags.proxy && !flags.vpn && !flags.tor && !flags.mobile

  const kind = classifyKind(flags)
  const purity = purityScore(flags, kind)

  return {
    ip,
    cc,
    country,
    region,
    city,
    isp,
    asn,
    org,
    proxy: flags.proxy || flags.vpn,
    hosting: flags.hosting || flags.datacenter,
    mobile: flags.mobile,
    kind,
    purity,
    risk: riskLevel(flags, purity),
  }
}

/** 国内出口（分流规则通常走直连），用来判断本地运营商与归属地。 */
async function collectLocalExit(): Promise<{ ip: string; area: string; carrier: string }> {
  const [ipip, plain] = await Promise.all([
    httpText("https://myip.ipip.net", 3500),
    httpText("https://ip.3322.net", 3500),
  ])

  let ip = ""
  let area = ""
  let carrier = ""

  const ipMatched = clean(ipip.text).match(/IP[：:\s]*(\d{1,3}(?:\.\d{1,3}){3})/i)
  if (ipMatched) ip = ipMatched[1]

  const fromMatched = clean(ipip.text).match(/来自于[：:\s]*(.+)/)
  if (fromMatched) {
    const parts = fromMatched[1].trim().split(/\s+/).filter(Boolean)
    if (parts.length > 0) {
      carrier = parts[parts.length - 1]
      area = parts.slice(0, parts.length - 1).join(" ")
    }
  }

  if (!ip) {
    const plainMatched = clean(plain.text).match(/(\d{1,3}(?:\.\d{1,3}){3})/)
    if (plainMatched) ip = plainMatched[1]
  }

  if (ip && (!area || !carrier)) {
    const detail = await httpJson(
      `http://ip-api.com/json/${ip}?lang=zh-CN&fields=status,country,regionName,city,isp,org&_=${Date.now()}`,
      3500
    )
    const data: any = detail.data || null
    if (data && data.status === "success") {
      area = area || [clean(data.country), clean(data.regionName), clean(data.city)].filter(Boolean).join(" ")
      carrier = carrier || clean(data.isp) || clean(data.org)
    }
  }

  return {
    ip,
    area: area || "中国大陆",
    carrier: shortCarrier(carrier),
  }
}

function readLocalNetwork(): { net: string; ip: string; vpn: boolean; v6: boolean } {
  let wifiIP = ""
  let cellIP = ""
  let otherIP = ""
  let vpn = false
  let v6 = false

  try {
    const interfaces = Device.networkInterfaces()
    for (const name of Object.keys(interfaces)) {
      const lower = name.toLowerCase()
      const list = interfaces[name] || []
      for (const item of list) {
        if (item.isInternal) continue
        if (item.family === "IPv6") {
          v6 = true
          continue
        }
        if (item.family !== "IPv4") continue
        if (lower.startsWith("utun") || lower.startsWith("ipsec") || lower.startsWith("ppp")) {
          vpn = true
          continue
        }
        if (lower === "en0") wifiIP = item.address
        else if (lower.startsWith("pdp_ip")) cellIP = cellIP || item.address
        else otherIP = otherIP || item.address
      }
    }
  } catch (_) {}

  const net = wifiIP ? "WiFi" : cellIP ? "蜂窝网络" : otherIP ? "其他网络" : "未知网络"
  return { net, ip: wifiIP || cellIP || otherIP, vpn, v6 }
}

async function measureLatency(urls: string[]): Promise<number> {
  const results = await Promise.all(
    urls.map(async (url) => {
      const result = await httpText(url + (url.includes("?") ? "&" : "?") + `_=${Date.now()}`, 3000)
      return { ok: result.status >= 200 && result.status < 500, ms: result.ms }
    })
  )

  const passed = results.filter((item) => item.ok).sort((x, y) => x.ms - y.ms)
  return passed.length ? passed[0].ms : 0
}

async function detectQuic(): Promise<{ ok: boolean | null; reachable: boolean }> {
  // 普通 fetch 不保证使用 QUIC；代理远端 trace 也不能证明设备 UDP 链路。
  return { ok: null, reachable: false }
}

async function testServices(services: ServiceDef[], cc: string, parallel: number): Promise<ServiceInfo[]> {
  return mapLimit(services, parallel, async (service) => {
    const result = await httpText(
      service.url + (service.url.includes("?") ? "&" : "?") + `_=${Date.now()}`,
      4000
    )
    return {
      id: service.id,
      name: service.name,
      ok: result.status >= 200 && result.status < 400,
      status: result.status,
      cc: "",
      policy: "",
    }
  })
}

/** 慢路径：12 个服务的网页可达性（4s 超时，并发 6）。 */
export async function diagnoseServices(): Promise<{ media: ServiceInfo[]; ai: ServiceInfo[] }> {
  const [media, ai] = await Promise.all([
    testServices(MEDIA_SERVICES, "", 6),
    testServices(AI_SERVICES, "", 6),
  ])
  return { media, ai }
}

/** 快路径：出口 IP、延迟、本地网络。小组件每次刷新只跑这一层。 */
export async function diagnoseCore(): Promise<Omit<Snapshot, "media" | "ai">> {
  const startedAt = Date.now()

  const [exit, localExit, proxyLatency, localLatency, quic] = await Promise.all([
    collectExit(),
    collectLocalExit(),
    measureLatency(GLOBAL_LATENCY_URLS),
    measureLatency(MAINLAND_LATENCY_URLS),
    detectQuic(),
  ])

  const localNet = readLocalNetwork()

  const local: LocalInfo = {
    ...EMPTY_LOCAL,
    net: localNet.net,
    ip: localNet.ip,
    dns: "",
    gw: "",
    area: localExit.area,
    carrier: localExit.carrier,
    nat: detectNAT(localNet.ip, exit.ip),
    vpn: localNet.vpn,
    v6: localNet.v6,
  }

  return {
    v: 1,
    ts: Date.now(),
    src: "self",
    exit,
    local,
    lat: { proxy: proxyLatency, local: localLatency },
    quic,
    cost: Date.now() - startedAt,
  }
}

export async function diagnose(): Promise<Snapshot> {
  const [core, services] = await Promise.all([diagnoseCore(), diagnoseServices()])
  return { ...core, media: services.media, ai: services.ai, cost: core.cost }
}
