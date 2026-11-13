// Stash Clash API（只读）：/configs、/proxies、/connections。
// 内部沿用 surge 命名以兼容 UI，仅做 GET，不修改任何 Stash 配置。
//
// 关键点：Stash 的 /connections 提供 metadata.host、chains、rule，可直接得到
// 「这条连接真正走了哪个出口节点」。chains 顺序为 [节点, 上层组, 更上层组…]。
import { httpJson } from "./net"
import type { SurgeInfo } from "./types"
import type { Settings } from "./store"

export type SurgeState = { info: SurgeInfo | null; error: string; detail: string }

type Proxy = { type?: string; now?: string; all?: string[] }
type Proxies = Record<string, Proxy>
type Conn = {
  id?: string
  /** Stash 返回 {current,max,total,last}，部分版本是数字。 */
  upload?: number | { total?: number; current?: number }
  download?: number | { total?: number; current?: number }
  chains?: string[]
  metadata?: { host?: string; destinationIP?: string; network?: string }
}

function bytesOf(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (value && typeof value === "object") {
    const record = value as { total?: number; current?: number }
    if (typeof record.total === "number") return record.total
    if (typeof record.current === "number") return record.current
  }
  return 0
}

function trafficOf(conn: Conn): number {
  return bytesOf(conn.upload) + bytesOf(conn.download)
}

const MODES: Record<string, string> = { rule: "规则分流", global: "全局代理", direct: "全部直连" }
const GROUP_TYPES = /selector|urltest|url-test|fallback|loadbalance|load-balance|relay/i
const LOCAL_POLICIES = /^(DIRECT|REJECT|REJECT-DROP|PASS|COMPATIBLE)$/i

function apiBase(settings: Settings): string {
  const host = settings.surgeHost.trim() || "127.0.0.1"
  // 地址仅接收主机名/IP，避免凭据被带到意外路径或 URL userinfo。
  if (!/^(?:[a-z0-9.-]+|\[[a-f0-9:]+\])$/i.test(host)) throw new Error("地址应只填写主机名或 IP")
  return `http://${host}:${settings.surgePort || 9090}`
}

function headers(settings: Settings): Record<string, string> {
  return settings.surgeKey ? { Authorization: `Bearer ${settings.surgeKey}` } : {}
}

export function isGroupType(type: string): boolean {
  return GROUP_TYPES.test(String(type || ""))
}

/** 顺着策略组的 now 往下钻到真正的节点。 */
export function resolveSelection(proxies: Proxies, start: string): { node: string; protocol: string } | null {
  let current = start
  const visited = new Set<string>()
  while (current && !visited.has(current) && visited.size < 32) {
    visited.add(current)
    const entry = proxies[current]
    if (!entry || typeof entry !== "object") return null
    if (Array.isArray(entry.all) || isGroupType(entry.type || "")) {
      if (!entry.now || (Array.isArray(entry.all) && !entry.all.includes(entry.now))) return null
      current = entry.now
      continue
    }
    return { node: current, protocol: entry.type || "未知" }
  }
  return null
}

/** 从 chains 找出真正的出口节点与最内层策略组。chains 顺序为 [节点, 上层组 …]。 */
export function parseChains(proxies: Proxies, chains: string[] | undefined): { node: string; group: string; protocol: string } | null {
  const list = Array.isArray(chains) ? chains.filter(Boolean) : []
  if (!list.length) return null

  let node = ""
  let group = ""

  for (const name of list) {
    if (LOCAL_POLICIES.test(name)) return null
    const type = proxies[name]?.type || ""
    if (isGroupType(type)) {
      if (!group) group = name
      continue
    }
    if (!node) node = name
  }

  // 兜底：链里只有策略组名时，取第一个组的 now 继续解析
  if (!node) {
    for (const name of list) {
      const resolved = resolveSelection(proxies, name)
      if (resolved) return { node: resolved.node, group: group || name, protocol: resolved.protocol }
    }
    return null
  }

  return { node, group: group || node, protocol: proxies[node]?.type || "未知" }
}

function normalizeHost(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/:\d+$/, "")
    .replace(/^www\./, "")
}

export type OutboundStat = { node: string; group: string; protocol: string; count: number; bytes: number }

/** 统计活跃连接的出口分布，按流量+连接数排出主导出口。 */
export function summarizeConnections(proxies: Proxies, conns: Conn[]): {
  outbound: OutboundStat | null
  byHost: Map<string, OutboundStat>
  groups: Map<string, number>
  active: number
} {
  const stats = new Map<string, OutboundStat>()
  const byHost = new Map<string, OutboundStat>()
  const groups = new Map<string, number>()
  let active = 0

  for (const conn of conns) {
    const parsed = parseChains(proxies, conn.chains)
    if (!parsed) continue
    active += 1

    const bytes = trafficOf(conn)
    const key = parsed.node
    const prev = stats.get(key)
    if (prev) {
      prev.count += 1
      prev.bytes += bytes
    } else {
      stats.set(key, { ...parsed, count: 1, bytes })
    }

    if (parsed.group) groups.set(parsed.group, (groups.get(parsed.group) || 0) + 1)

    // 同一 host 取流量最大的一跳，避免 keep-alive 多连接抖动
    const hosts = new Set<string>()
    const host = normalizeHost(conn.metadata?.host)
    if (host) hosts.add(host)
    for (const h of hosts) {
      const old = byHost.get(h)
      if (!old || old.bytes < bytes) byHost.set(h, { ...parsed, count: 1, bytes })
    }
  }

  let outbound: OutboundStat | null = null
  for (const stat of stats.values()) {
    if (
      !outbound ||
      stat.bytes > outbound.bytes ||
      (stat.bytes === outbound.bytes && stat.count > outbound.count)
    ) {
      outbound = stat
    }
  }

  return { outbound, byHost, groups, active }
}

/** /proxies 里被引用最多、且有明确 now 的策略组（用作默认观察组）。 */
export function busiestGroup(proxies: Proxies): string {
  const refs = new Map<string, number>()
  for (const [name, entry] of Object.entries(proxies)) {
    if (!entry || typeof entry !== "object") continue
    if (!isGroupType(entry.type || "")) continue
    const target = entry.now
    if (!target) continue
    const child = proxies[target]
    if (child && isGroupType(child.type || "")) refs.set(name, (refs.get(name) || 0) + 1)
  }
  let best = ""
  let bestCount = 0
  for (const [name, count] of refs) {
    if (count > bestCount) {
      best = name
      bestCount = count
    }
  }
  return best
}

export async function readSurgeState(settings: Settings): Promise<SurgeState> {
  if (!settings.apiEnabled) {
    return { info: null, error: "未启用 Stash API", detail: "仍可使用本机自测" }
  }

  let base: string
  try {
    base = apiBase(settings)
  } catch (_) {
    return { info: null, error: "API 地址无效", detail: "请仅填写主机名或 IP" }
  }

  const auth = headers(settings)
  const [config, proxy, connections] = await Promise.all([
    httpJson<any>(`${base}/configs`, 1500, auth),
    httpJson<any>(`${base}/proxies`, 1500, auth),
    httpJson<any>(`${base}/connections`, 1800, auth),
  ])

  if ([config, proxy, connections].some((r) => r.status === 401 || r.status === 403)) {
    return { info: null, error: "API 认证失败或无权限", detail: "请检查 Bearer secret" }
  }
  if (!config.ok || typeof config.data?.mode !== "string") {
    return { info: null, error: "无法读取 Stash 模式", detail: `/configs HTTP ${config.status || "无响应"}` }
  }

  const modeRaw = String(config.data.mode).toLowerCase()
  const mode = MODES[modeRaw] || modeRaw
  const proxies: Proxies =
    proxy.ok && proxy.data?.proxies && typeof proxy.data.proxies === "object" ? proxy.data.proxies : {}
  const conns: Conn[] = connections.ok && Array.isArray(connections.data?.connections) ? connections.data.connections : []

  if (modeRaw === "direct") {
    return {
      info: { mode, policy: "DIRECT", node: "全部直连", protocol: "Direct", source: "direct", active: conns.length },
      error: "",
      detail: `活跃连接：${conns.length}（仅当前连接，不含历史）`,
    }
  }

  const summary = summarizeConnections(proxies, conns)
  const wanted = settings.policyGroup.trim()
  const autoGroup = wanted || busiestGroup(proxies)

  // ① 活跃连接里的真实出口优先——这就是此刻真正承载流量的节点
  let primary = summary.outbound
  if (wanted) {
    // 用户指定了观察组时，改用该组链上的节点；若该组在活跃连接中出现过则仍以实测为准
    const fromConn = Array.from(summary.byHost.values()).find((item) => item.group === wanted)
    if (fromConn) primary = fromConn
    else {
      const resolved = resolveSelection(proxies, wanted)
      if (resolved) primary = { ...resolved, group: wanted, count: 0, bytes: 0 }
    }
  }

  if (!primary && autoGroup) {
    const resolved = resolveSelection(proxies, autoGroup)
    if (resolved) primary = { ...resolved, group: autoGroup, count: 0, bytes: 0 }
  }

  if (!primary) {
    return {
      info: null,
      error: "没有可用的出口信息",
      detail: `活跃连接：${summary.active}；/proxies 组数 ${Object.keys(proxies).length}`,
    }
  }

  const fromConnections = primary.count > 0
  const detail = fromConnections
    ? `实时出口来自 ${summary.active} 条活跃连接（${primary.count} 条走该节点，累计 ${formatBytes(primary.bytes)}）；不含历史记录`
    : `出口来自策略组链：${autoGroup || "默认"} → ${primary.node}（当前无走代理的活跃连接）`

  return {
    info: {
      mode,
      policy: primary.group || autoGroup || "默认",
      node: primary.node,
      protocol: primary.protocol,
      source: fromConnections ? "connections" : "policy-chain",
      active: summary.active,
    },
    error: proxy.ok ? "" : "策略列表不可用",
    detail,
  }
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value < 10 && index > 0 ? value.toFixed(1) : Math.round(value)} ${units[index]}`
}

export async function fetchSurgeState(settings: Settings): Promise<SurgeInfo | null> {
  return (await readSurgeState(settings)).info
}

/**
 * 按域名把每条探测服务对回活跃连接里真实使用的出口节点。
 * 返回 Map<host, 节点信息>；没有命中就留空，由调用方回退到主出口。
 */
export async function fetchServicePolicies(
  settings: Settings,
  hosts: string[]
): Promise<Map<string, { node: string; group: string; protocol: string }>> {
  const map = new Map<string, { node: string; group: string; protocol: string }>()
  if (!settings.apiEnabled || hitsEmpty(hosts)) return map

  let base: string
  try {
    base = apiBase(settings)
  } catch (_) {
    return map
  }

  const [proxy, connections] = await Promise.all([
    httpJson<any>(`${base}/proxies`, 1500, headers(settings)),
    httpJson<any>(`${base}/connections`, 1800, headers(settings)),
  ])
  if (!connections.ok) return map

  const proxies: Proxies = proxy.ok && proxy.data?.proxies && typeof proxy.data.proxies === "object" ? proxy.data.proxies : {}
  const conns: Conn[] = Array.isArray(connections.data?.connections) ? connections.data.connections : []
  const summary = summarizeConnections(proxies, conns)

  for (const wanted of hosts) {
    const target = normalizeHost(wanted)
    if (!target) continue
    for (const [host, stat] of summary.byHost) {
      if (host !== target && !host.endsWith(`.${target}`)) continue
      map.set(target, { node: stat.node, group: stat.group, protocol: stat.protocol })
      break
    }
  }

  return map
}

function hitsEmpty(hosts: string[]): boolean {
  return !Array.isArray(hosts) || hosts.length === 0
}

/* ------------------------------------------------------------------ */
/* 服务归属：活跃连接实测优先，未命中回退到当前出口节点                 */
/* ------------------------------------------------------------------ */

export function hostOf(url: string): string {
  const matched = String(url || "").match(/^https?:\/\/([^/?#]+)/i)
  return normalizeHost(matched ? matched[1] : "")
}

export type PolicyHit = { node: string; group: string; protocol: string }

/**
 * 把出口信息写到每条服务上：
 * - 活跃连接里按域名命中 → 标「实测」；
 * - 未命中则用当前出口节点回退（source 留空），避免出现空白/未知。
 */
export function attachServicePolicies<T extends { id: string; policy?: string; policyGroup?: string; policySource?: "connections" | "" }>(
  items: T[],
  defs: { id: string; url: string }[],
  hits: Map<string, PolicyHit>,
  fallback: PolicyHit | null
): T[] {
  const byId = new Map(defs.map((item) => [item.id, hostOf(item.url)]))
  return items.map((item) => {
    const host = byId.get(item.id) || ""
    const hit = host ? hits.get(host) : undefined
    if (hit) {
      return { ...item, policy: hit.node, policyGroup: hit.group, policySource: "connections" as const }
    }
    if (fallback && fallback.node) {
      return { ...item, policy: fallback.node, policyGroup: fallback.group, policySource: "" as const }
    }
    return item
  })
}
