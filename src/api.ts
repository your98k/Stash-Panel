// stash-panel / stash.ts
// 读 Stash 接口的数据地址、调用操作地址. 都是明文 http (Stash 拦截后直接返回, 不出网), fetch 要显式允许

import { fetch } from 'scripting'

// Adapted from MaYIHEI's Stash Panel; internal names retained for widget compatibility.
import { getApiUrl, getApiSecret, getCheckOpts, getPrefs, type Prefs } from './settings'

const AppStorage = Storage as unknown as {
  get<T = unknown>(key: string): T | null
  set(key: string, value: unknown): void
  remove(key: string): void
}

const PAGE_KEY = 'stashpanel.page'
const PICK_KEY = 'stashpanel.pick'
const CACHE_KEY = 'stashpanel.data'
const HISTORY_KEY = 'stashpanel.delayHistory'
export const DATA_URL = '/configs'

/** h: 最近 24 次延迟 (ms), 超时记 -1; fail: 连续超时次数 */
export type NodeResult = { ok: boolean; ms: number; t: number; ip?: string; cc?: string; asn?: string; org?: string; err?: string; h?: number[]; fail?: number }
/** gone: 当前节点已经不在订阅里 */
export type Group = { name: string; now: string; leaf: string; subs: string[]; gone?: boolean; type?: string; selectable?: boolean }
export type Media = { name: string; status: 'yes' | 'partial' | 'no' | 'unknown'; region?: string; note?: string }
export type Isp = 'ct' | 'cu' | 'cm'
/** 深度检测结果, 拿不到的字段没有 */
export type Deep = {
  t: number
  basic?: { ip?: string; cc?: string; country?: string; city?: string; asn?: string; org?: string; registered?: string; timezone?: string; route?: string }
  egress?: { ip: string; main?: boolean; sources?: string[]; asn?: string; cc?: string }[]
  types?: { source: string; type: string }[]
  scores?: { source: string; score?: number; text?: string }[]
  factors?: { source: string; proxy?: boolean; vpn?: boolean; tor?: boolean; hosting?: boolean }[]
  media?: Media[]
  regions?: { exit?: string; mismatch?: string[] }
  stability?: { target: string; ok: number; total: number; median?: number; max?: number }[]
  ping?: { isp: Isp; avg?: number; loss?: number; jitter?: number }[]
  inbound?: { isp: Isp; hops?: number; asPath?: string[]; summary?: string }[]
  backhaul?: { isp: Isp; probe?: string; hops?: number; asPath?: string[]; summary?: string }[]
  dnsbl?: { checked: number; listed: { list: string; hit?: string }[] }
  dnsleak?: { servers: { ip: string; cc?: string; org?: string }[]; ecs?: { ip: string; geo?: string } }
  dns?: { checked: number; polluted: string[]; hits?: { domain: string; ip: string; owner: string }[] }
  speed?: { down?: number; up?: number; bytes?: number; conns?: number }
  bgp?: { prefix?: string; rpki?: string; holder?: string }
  /** 完整检测才有 */
  mtr?: { isp: Isp; hops?: number; reached?: boolean; avg?: number; loss?: number; jitter?: number }[]
  bgppath?: { count: number; collectors?: number; seen?: number; peers?: number; samples?: { collector?: string; path: string[] }[]; clues?: { asn: string; count: number }[]; origin?: string }
  status?: { ok: number; total: number; failed?: string[]; skipped?: string[]; split?: string; reasons?: Record<string, string>; requests: number; sent: number; ms: number }
  errors?: Record<string, string>
}
export type StashEvent = { t: number; k: string; msg: string }
/** 插件设置: 存在插件里, 在 App 里改. push 只表示配好了没有, 密钥不返回 */
export type Opts = { notify: boolean; auto: boolean; net: boolean; lookup_direct?: boolean; timeout: number; test_url: string; ip_url: string; push: boolean; full: string[] }
export type OptsPatch = Partial<Omit<Opts, 'push' | 'full' | 'test_url' | 'ip_url'>> & { test_url?: string; ip_url?: string; groups?: string[]; push_key?: string; targets?: string[] }

export type StashData = {
  v: number
  speed?: { uploadTotal?: number; downloadTotal?: number; upload?: number; download?: number; networkQuality?: unknown }
  version?: string
  t: number
  mode: number                 // 0 全局直连 / 1 分流 / 2 全局代理 / -1 未知
  final: string
  global: string
  groups: Group[]
  nodes: Record<string, NodeResult>
  check: { t: number; took: number; tested: number; total: number } | null
  direct?: { ip?: string; cc?: string; asn?: string; org?: string } | null
  media?: Record<string, { t: number; list: Media[] }>
  deep?: Record<string, Deep>
  locks?: Record<string, string>
  events?: StashEvent[]         // 新的在前
  opts?: Opts
  cfg?: { keys: string[]; group: string[] }
  result?: { ok: boolean; error?: string }
  stale?: boolean              // 连不上 Stash, 显示的是上次的数据
  mock?: boolean
}

export const MODES = [
  { id: 0, name: '全局直连', short: '直连', icon: 'arrow.right' },
  { id: 1, name: '分流', short: '分流', icon: 'arrow.triangle.branch' },
  { id: 2, name: '全局代理', short: '全局', icon: 'globe' },
]
export const modeName = (m: number) => MODES.find(x => x.id === m)?.short ?? '未知'

/** Never expose native error bodies, request URLs or Authorization in the UI. */
export async function api<T = any>(path: string, method = 'GET', body?: unknown, timeout = 8): Promise<T> {
  let response
  try {
    const secret = getApiSecret()
    response = await fetch(`${getApiUrl()}${path}`, {
      method, timeout, allowInsecureRequest: true,
      headers: { ...(secret ? { Authorization: `Bearer ${secret}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch { throw new Error('无法连接 Stash，请确认已开启外部控制、地址和端口正确') }
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Stash 鉴权失败，请检查密钥' : `Stash HTTP ${response.status}`)
  if (method !== 'GET') return undefined as T
  try { return await response.json() as T } catch { throw new Error('Stash 返回的数据无法解析') }
}

type NativeProxy = { name?: string; type?: string; now?: string; all?: string[]; history?: { time: string; delay: number }[]; delay?: number; alive?: boolean; proxies?: NativeProxy[] }
type Point = { time: string; delay: number }
function readHistory(): Record<string, Point[]> {
  try { return JSON.parse(AppStorage.get<string>(HISTORY_KEY) || '{}') } catch { return {} }
}
const selectable = (type = '') => /^(selector|select)$/i.test(type)
const modeNumber = (mode: string) => (({ direct: 0, rule: 1, global: 2 } as Record<string, number>)[mode.toLowerCase()] ?? -1)

export function normalize(config: any, version: any, display: any, raw: any, speed?: StashData['speed']): StashData {
  const proxies: Record<string, NativeProxy> = { ...(raw?.proxies ?? {}) }
  const displayGroups: NativeProxy[] = Array.isArray(display?.proxyGroups) ? display.proxyGroups : []
  for (const g of displayGroups) {
    if (!g.name) continue
    proxies[g.name] = { ...proxies[g.name], ...g, all: g.proxies?.map(p => p.name!).filter(Boolean) ?? proxies[g.name]?.all }
    for (const p of g.proxies ?? []) if (p.name) proxies[p.name] = { ...p, ...proxies[p.name] }
  }
  const resolve = (name: string, seen = new Set<string>()): string => {
    if (seen.has(name)) return name
    seen.add(name)
    const p = proxies[name]
    return p?.now && p.now !== name ? resolve(p.now, seen) : name
  }
  const groups: Group[] = Object.entries(proxies).filter(([, p]) => Array.isArray(p.all)).map(([name, p]) => ({
    name, now: p.now ?? '', leaf: resolve(name), subs: [...new Set(p.all)], type: p.type, selectable: selectable(p.type),
  }))
  const nodes: Record<string, NodeResult> = {}
  const stored = readHistory()
  for (const [name, p] of Object.entries(proxies)) {
    if (Array.isArray(p.all) || /^(DIRECT|REJECT)$/i.test(name)) continue
    // Real Stash history only. delay=0 means failed, not a successful zero-ms sample.
    const points = [...(stored[name] ?? []), ...(p.history ?? [])]
    const unique = [...new Map(points.filter(x => x && Number.isFinite(x.delay)).map(x => [`${x.time}:${x.delay}`, x])).values()]
      .sort((a, b) => Date.parse(a.time) - Date.parse(b.time)).slice(-24)
    const last = unique[unique.length - 1]
    if (!last && !Number.isFinite(p.delay)) continue
    const delay = last?.delay ?? p.delay!
    const ok = p.alive !== false && delay > 0
    nodes[name] = { ok, ms: ok ? delay : 0, t: last ? Date.parse(last.time) || Date.now() : Date.now(), h: unique.length ? unique.map(x => x.delay > 0 ? x.delay : -1) : [ok ? delay : -1] }
  }
  const final = groups.find(g => g.selectable && g.name !== 'GLOBAL')?.name ?? groups[0]?.name ?? ''
  const checked = Object.values(nodes)
  return { v: 1, t: Date.now(), version: version?.version, mode: modeNumber(String(config?.mode ?? display?.mode ?? '')), final, global: groups.find(g => g.name === 'GLOBAL')?.name ?? final, groups, nodes, speed,
    check: checked.length ? { t: Math.max(...checked.map(n => n.t)), took: 0, tested: checked.length, total: checked.length } : null }
}

async function fetchData(): Promise<StashData> {
  const [config, raw, display, version, speed] = await Promise.all([
    api('/configs'), api('/proxies'), api('/stash/proxy/display/v2').catch(() => null), api('/version').catch(() => null), api<StashData['speed']>('/stash/speed').catch(() => undefined),
  ])
  if (!raw?.proxies || typeof raw.proxies !== 'object') throw new Error('Stash 未返回策略组数据')
  const data = normalize(config, version, display, raw, speed)
  AppStorage.set(CACHE_KEY, JSON.stringify({ host: getApiUrl(), data }))
  return data
}

export const cachedStash = (): StashData | null => {
  try {
    const cached = JSON.parse(AppStorage.get<string>(CACHE_KEY) || 'null')
    return cached?.host === getApiUrl() && cached?.data ? { ...cached.data, stale: true } : null
  } catch { return null }
}
export async function loadStash(): Promise<{ data: StashData | null; error: string }> {
  try { return { data: await fetchData(), error: '' } }
  catch (e) { return { data: cachedStash(), error: (e as Error).message } }
}

export async function testNode(name: string): Promise<StashData> {
  const opts = getCheckOpts()
  const result = await api<{ delay: number; alive?: boolean; history?: Point[] }>(`/proxies/${encodeURIComponent(name)}/delay?timeout=${opts.timeout}&url=${encodeURIComponent(opts.test_url)}`, 'GET', undefined, Math.ceil(opts.timeout / 1000) + 3)
  const hist = readHistory()
  hist[name] = [...(hist[name] ?? []), ...(result.history ?? []), { time: new Date().toISOString(), delay: result.alive === false ? 0 : Number(result.delay) || 0 }].slice(-24)
  AppStorage.set(HISTORY_KEY, JSON.stringify(hist))
  return fetchData()
}

/** All writes are called only by an explicit UI/AppIntent action. Never by load/widget refresh. */
export async function setStash(q: { mode?: number; group?: string; node?: string; lock?: number; quiet?: number }, timeout = 25): Promise<StashData> {
  if (q.lock !== undefined) throw new Error('Stash 面板不支持策略锁定')
  if (q.mode !== undefined) {
    const mode = ['direct', 'rule', 'global'][q.mode]
    if (!mode) throw new Error('无效模式')
    await api('/configs', 'PATCH', { mode }, timeout)
  } else if (q.group && q.node) {
    const data = await fetchData()
    const group = data.groups.find(g => g.name === q.group)
    if (!group?.selectable) throw new Error('该策略组由 Stash 自动管理，不能手动选择成员')
    if (!group.subs.includes(q.node)) throw new Error('节点不在该策略组中')
    await api(`/proxies/${encodeURIComponent(q.group)}`, 'PUT', { name: q.node }, timeout)
  } else {
    const data = await fetchData()
    const group = activeGroup(data, getPrefs())
    if (!group?.leaf) throw new Error('没有可检测的当前节点')
    return testNode(group.leaf)
  }
  return fetchData()
}

/** DNS 服务器按归属合并: 同一家常有好几个 IP */
export function dnsServers(d: Deep): string[] {
  const count = new Map<string, number>()
  for (const s of d.dnsleak?.servers ?? []) {
    const name = `${s.cc ?? ''} ${s.org ?? s.ip}`.trim()
    count.set(name, (count.get(name) ?? 0) + 1)
  }
  return [...count].map(([name, n]) => (n > 1 ? `${name} ${n} 个` : name))
}

export const clearStashCache = () => { AppStorage.remove(CACHE_KEY); AppStorage.remove(HISTORY_KEY) }

// ────────────────────────────────────────────────────────────
// 取值
// ────────────────────────────────────────────────────────────
/** 主策略组: 设置里选的, 没选用兜底策略, 再没有用第一个 */
export function mainGroup(d: StashData, prefs: Prefs): Group | undefined {
  return d.groups.find(g => g.name === prefs.main) ?? d.groups.find(g => g.name === d.final) ?? d.groups[0]
}

/** 现在实际走的策略组: 全局代理模式走全局策略, 其他模式走主策略组 */
export function activeGroup(d: StashData, prefs: Prefs): Group | undefined {
  return (d.mode === 2 ? d.groups.find(g => g.name === d.global) : undefined) ?? mainGroup(d, prefs)
}

/** 看板列的策略组: 设置里选的 (按选的顺序), 没选用前 4 个 */
export function shownGroups(d: StashData, prefs: Prefs): Group[] {
  const picked = prefs.groups.map(n => d.groups.find(g => g.name === n)).filter((g): g is Group => !!g)
  return picked.length ? picked : d.groups.slice(0, 4)
}

/** 页码绕回: 往前翻会变成负数 */
const wrap = (n: number, size: number) => ((n % size) + size) % size

/** 小组件翻页: 设了常用就只翻常用的, 没设就翻全部; 页码存 Storage, 翻到头回第一页 */
export function groupPage(d: StashData, prefs: Prefs, size: number): { list: Group[]; page: number; pages: number } {
  const first = shownGroups(d, prefs)
  const all = prefs.groups.length ? first : d.groups
  const pages = Math.max(1, Math.ceil(all.length / size))
  const page = wrap(AppStorage.get<number>(PAGE_KEY) ?? 0, pages)
  return { list: all.slice(page * size, (page + 1) * size), page, pages }
}

export const turnGroupPage = (step: number) => AppStorage.set(PAGE_KEY, (AppStorage.get<number>(PAGE_KEY) ?? 0) + step)

/** 点开的策略组 (open) 和它的节点页码 (p); path 是点进去的下层策略组
 *  在切换器、策略组卡片、看板、总览上点了哪个组, 这个尺寸的小组件临时列出它的节点, 5 分钟后回到原样 */
type Pick = { p: number; path?: string[]; open?: string; owner?: string; t?: number }
const readPick = (): Pick => AppStorage.get<Pick>(PICK_KEY) ?? { p: 0 }
export type Hop = { group: string; node: string }

export const focusOf = (owner: string) => {
  const x = readPick()
  return x.open && x.owner === owner && Date.now() - (x.t ?? 0) < 300_000 ? x.open : ''
}
export const openPick = (open: string, owner: string) => AppStorage.set(PICK_KEY, { ...readPick(), p: 0, path: [], open, owner, t: Date.now() })
export const closePick = () => {
  const x = readPick()
  if (x.open) AppStorage.set(PICK_KEY, { p: 0 })
}

/** 从 root 一层层走到 node 要切的每一步; 走不到返回 null */
export function pathTo(d: StashData, root: string, node: string, seen = new Set<string>()): Hop[] | null {
  const g = d.groups.find(x => x.name === root)
  if (!g || seen.has(root)) return null
  seen.add(root)
  if (g.subs.includes(node) && (g.selectable || g.now === node)) return g.selectable ? [{ group: root, node }] : []
  for (const n of g.subs.filter(n => g.selectable || g.now === n)) {
    const rest = pathTo(d, n, node, seen)
    if (rest) return [...(g.selectable ? [{ group: root, node: n }] : []), ...rest]
  }
  return null
}

/** 节点由 Stash 自己选的组 (自动测速、按网络切换): 只能整组用, 不能选里面的节点; 脚本读不到组的类型, 只能看名字 */
export const isAuto = (name: string) => {
  const group = cachedStash()?.groups.find(g => g.name === name)
  return group ? !group.selectable : /自动|auto|url-?test|fallback|load-?balance/i.test(name)
}

/** 一个策略组下面所有真实节点, 不管套了几层 */
export function leafNodes(d: StashData, name: string, seen = new Set<string>()): string[] {
  const g = d.groups.find(x => x.name === name)
  if (!g || seen.has(name)) return []
  seen.add(name)
  const out = g.subs.flatMap(n => (d.groups.some(x => x.name === n) ? leafNodes(d, n, seen) : /^(DIRECT|REJECT)/i.test(n) ? [] : [n]))
  return [...new Set(out)]
}

/** 点开的策略组里列哪些节点; 没点开或组已经没了返回 null, 显示策略组列表 */
export function pickerView(d: StashData, size: number, open: string): { group: Group; via: Hop[]; nodes: string[]; total: number; page: number; pages: number } | null {
  const top = d.groups.find(g => g.name === open)
  if (!top) return null
  const pick = readPick()
  // 只进一层: 点进下层策略组后直接列出它下面所有节点, 不再一层层点
  const inner = d.groups.find(x => x.name === pick.path?.[0] && top.subs.includes(x.name))
  const group = inner ?? top
  const via: Hop[] = inner ? [{ group: top.name, node: inner.name }] : []
  // 按网络切换的组同一个成员会出现好几次, 去重
  const all = inner ? leafNodes(d, inner.name) : [...new Set(top.subs.filter(n => !/^REJECT/i.test(n)))]
  const pages = Math.max(1, Math.ceil(all.length / size))
  const page = wrap(pick.p, pages)
  return { group, via, nodes: all.slice(page * size, (page + 1) * size), total: all.length, page, pages }
}

export const enterPick = (name: string) => { const x = readPick(); AppStorage.set(PICK_KEY, { ...x, p: 0, path: [name] }) }
export const leavePick = () => { const x = readPick(); AppStorage.set(PICK_KEY, { ...x, p: 0, path: [] }) }
export const turnPickPage = (step: number) => { const x = readPick(); AppStorage.set(PICK_KEY, { ...x, p: x.p + step }) }

/** 点策略组那一行切到哪: 体检过且能用的里最快的 (不含当前), 都没测过就切到下一个; 不切到 DIRECT / REJECT
 *  选项可能是另一个策略组, 看它正在用的节点; 和当前同一个节点的不算, 切过去没有变化 */
export function switchTarget(d: StashData, g: Group): string | undefined {
  if (!g.selectable) return undefined
  const leaf = (n: string) => d.groups.find(x => x.name === n)?.leaf ?? n
  const alive = g.subs.filter(n => !/^(DIRECT|REJECT)/i.test(n) && d.nodes[leaf(n)]?.ok)
    .sort((a, b) => d.nodes[leaf(a)].ms - d.nodes[leaf(b)].ms)
  const best = alive[0]
  return best && best !== g.now && leaf(best) !== g.leaf ? best : undefined
}

/** 真正选中当前节点的那个策略组: 主策略组常常只是指向别的策略组 */
export const ownerGroup = (d: StashData, g: Group) => {
  const seen = new Set<string>()
  let current = g, owner = g
  while (!seen.has(current.name)) {
    seen.add(current.name)
    if (current.selectable) owner = current
    const next = d.groups.find(x => x.name === current.now)
    if (!next) break
    current = next
  }
  return owner
}

/** 体检过的节点, 当前在用的排前面, 其余能用的按延迟、不能用的放最后 */
export function rankedNodes(d: StashData): { name: string; r: NodeResult; current: boolean }[] {
  const current = new Set(d.groups.map(g => g.leaf))
  return Object.entries(d.nodes)
    .map(([name, r]) => ({ name, r, current: current.has(name) }))
    .sort((a, b) => Number(b.current) - Number(a.current) || Number(b.r.ok) - Number(a.r.ok) || a.r.ms - b.r.ms)
}

/** 24 次体检里成功的比例 (0-1), 没有历史时 null */
export function availability(r?: NodeResult): number | null {
  const h = r?.h
  return h && h.length ? h.filter(x => x >= 0).length / h.length : null
}

/** 小组件上显示这几个; 检测结果里更多的服务在 App 里看 */
const UNLOCK_NAMES = ['Netflix', 'YouTube', 'Disney+', 'ChatGPT', 'Claude', 'Gemini']

/** 解锁样式看的节点: 设置里选的策略组, 没选用主策略组 */
export function unlockNode(d: StashData, prefs: Prefs): { group: string; node: string; list: Media[]; t: number } | undefined {
  const g = d.groups.find(x => x.name === prefs.unlock) ?? activeGroup(d, prefs)
  if (!g) return undefined
  const m = d.media?.[g.leaf]
  const list = UNLOCK_NAMES.map(n => m?.list.find(x => x.name === n)).filter((x): x is Media => !!x)
  return { group: g.name, node: g.leaf, list, t: m?.t ?? 0 }
}

/** 最近一次深度检测: 优先主策略组当前节点, 否则取最新的一份 */
export function latestDeep(d: StashData, prefs: Prefs): { node: string; data: Deep } | undefined {
  const leaf = activeGroup(d, prefs)?.leaf
  const all = Object.entries(d.deep ?? {})
  const hit = all.find(([n]) => n === leaf) ?? all.sort((a, b) => b[1].t - a[1].t)[0]
  return hit ? { node: hit[0], data: hit[1] } : undefined
}

/** 有 IPv4 地址的 utun 接口 = 有 VPN 在跑; 分不出是不是 Stash */
export function vpnRunning(): boolean {
  const all = Device.networkInterfaces()
  return Object.keys(all).some(k => /^utun/.test(k) && all[k].some((a: { family: string }) => a.family === 'IPv4'))
}

export function stashStatus(d: StashData | null): { text: string; level: 'ok' | 'warn' | 'bad' } {
  if (d && !d.stale) return { text: 'Stash 已连接', level: 'ok' }
  return d ? { text: 'Stash 离线 · 缓存数据', level: 'warn' } : { text: '未连接 Stash', level: 'bad' }
}

export function healthCount(d: StashData): { ok: number; total: number } {
  const list = Object.values(d.nodes)
  return { ok: list.filter(r => r.ok).length, total: list.length }
}

// ────────────────────────────────────────────────────────────
// 示例数据
// ────────────────────────────────────────────────────────────
export function sampleStash(): StashData {
  const t = Date.now() - 6 * 60_000
  const wave = (base: number, seed: number, drops = 0) => Array.from({ length: 24 }, (_, i) => (i >= 24 - drops ? -1 : Math.round(base * (0.85 + 0.3 * Math.abs(Math.sin(i * 0.7 + seed))))))
  const n = (ms: number, _ip: string, _cc: string, _asn: string, _org: string, h: number[]): NodeResult => ({ ok: ms > 0, ms, t, h, err: ms > 0 ? undefined : '超时' })
  const media = (bad: string[]): Media[] => ['Netflix', 'YouTube', 'Disney+', 'ChatGPT', 'Claude', 'Gemini'].map(name => ({ name, status: bad.includes(name) ? 'no' : 'yes', region: bad.includes(name) ? undefined : 'HK' }))
  const hk = '🇭🇰 香港 IEPL 01'
  return {
    v: 1, version: '0.2.0', t: Date.now(), mode: 1, final: '兜底', global: '节点选择', mock: true,
    // Sample previews only; live totals always come from Stash /stash/speed.
    speed: { downloadTotal: 4.7 * 1024 ** 3, uploadTotal: 296.1 * 1024 ** 2, download: 0, upload: 0 },
    groups: [
      { name: '节点选择', now: '香港', leaf: hk, subs: ['香港', '🇯🇵 日本 东京', '🇺🇸 美国 洛杉矶', 'DIRECT'] },
      { name: '香港', now: hk, leaf: hk, subs: [hk, '🇭🇰 香港 IEPL 02', '🇭🇰 香港 HKT'] },
      { name: '流媒体', now: '🇸🇬 新加坡 01', leaf: '🇸🇬 新加坡 01', subs: ['🇸🇬 新加坡 01', '🇺🇸 美国 洛杉矶', '🇯🇵 日本 东京'] },
      { name: 'AI', now: '🇺🇸 美国 洛杉矶', leaf: '🇺🇸 美国 洛杉矶', subs: ['🇺🇸 美国 洛杉矶', '🇯🇵 日本 东京'] },
      { name: '兜底', now: '节点选择', leaf: hk, subs: ['节点选择', 'DIRECT'] },
    ],
    nodes: {
      [hk]: n(68, '103.151.172.18', 'HK', '4760', 'HKT Limited', wave(68, 1)),
      '🇭🇰 香港 IEPL 02': n(74, '103.151.172.44', 'HK', '4760', 'HKT Limited', wave(74, 2)),
      '🇭🇰 香港 HKT': n(0, '', '', '', '', wave(90, 3, 5)),
      '🇸🇬 新加坡 01': n(132, '154.26.133.9', 'SG', '141995', 'Contabo Asia', wave(132, 4)),
      '🇺🇸 美国 洛杉矶': n(196, '23.95.40.122', 'US', '36352', 'HostPapa', wave(196, 5, 1)),
      '🇯🇵 日本 东京': n(486, '45.76.211.7', 'JP', '20473', 'Vultr Holdings', wave(486, 6)),
    },
    check: { t, took: 14_200, tested: 6, total: 6 },
    events: [],
  }
}
