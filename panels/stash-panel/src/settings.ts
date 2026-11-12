// stash-panel / settings.ts
// 全局设置, 所有小组件共用. 改完调 Widget.reloadAll 让桌面跟着变

import type { Color } from 'scripting'

const AppStorage = Storage as unknown as {
  get<T = unknown>(key: string): T | null
  set(key: string, value: unknown): void
  remove(key: string): void
}

function read<T>(key: string, fallback: T): T {
  const raw = AppStorage.get<string>(key)
  try { return raw ? { ...fallback, ...JSON.parse(raw) } : fallback } catch { return fallback }
}

const write = (key: string, v: unknown) => AppStorage.set(key, JSON.stringify(v))

// ────────────────────────────────────────────────────────────
// Stash HTTP Control API 连接配置
// ────────────────────────────────────────────────────────────
const API_URL_KEY = 'stashpanel.api_url'
const SECRET_KEY = 'stashpanel.api_secret'
export const DEFAULT_API_URL = 'http://127.0.0.1:9090'

export const getApiUrl = () => (AppStorage.get<string>(API_URL_KEY) || DEFAULT_API_URL).replace(/\/+$/, '')
export const setApiUrl = (url: string) => {
  const value = (url.trim() || DEFAULT_API_URL).replace(/\/+$/, '')
  // Do not permit credentials, query strings or fragments in the host setting.
  if (!/^https?:\/\/(?:\[[0-9a-f:]+\]|[a-z0-9.-]+)(?::\d{1,5})?$/i.test(value)) throw new Error('请输入 http(s)://主机:端口，不要包含密钥或路径')
  AppStorage.set(API_URL_KEY, value)
}
export const getApiSecret = () => Keychain.get(SECRET_KEY) ?? ''
export const setApiSecret = (secret: string) => {
  const s = secret.trim()
  if (!s) return Keychain.remove(SECRET_KEY)
  if (!Keychain.set(SECRET_KEY, s)) throw new Error('密钥写入钥匙串失败')
  return true
}

// ────────────────────────────────────────────────────────────
// 刷新间隔 + 策略组 + 检测参数
// ────────────────────────────────────────────────────────────
/**
 * main: 小号「当前节点」和看板出口信息用哪个策略组, 空 = 兜底策略或第一个手动组
 * groups: 常用策略组, 节点页和小组件切换用, 空 = 前 4 个
 * unlock: 解锁样式看哪个策略组的节点, 空 = 主策略组
 * alerts: 用量提醒开关
 */
export type Alerts = { usage: boolean; runout: boolean; expire: boolean }
export type Prefs = { refresh: 15 | 30 | 60; main: string; groups: string[]; unlock: string; alerts: Alerts }
const PREFS_KEY = 'stashpanel.prefs'
export const getPrefs = () => read<Prefs>(PREFS_KEY, { refresh: 30, main: '', groups: [], unlock: '', alerts: { usage: true, runout: true, expire: false } })
export const setPrefs = (p: Prefs) => write(PREFS_KEY, p)

export type CheckOpts = {
  notify: boolean
  auto: boolean
  net: boolean
  lookup_direct: boolean
  timeout: number
  test_url: string
  ip_url: string
  full: string[]
}
const OPTS_KEY = 'stashpanel.opts'
export const DEFAULT_CHECK_OPTS: CheckOpts = {
  notify: false,
  auto: false,
  net: true,
  lookup_direct: false,
  timeout: 5000,
  test_url: 'http://www.gstatic.com/generate_204',
  ip_url: 'https://api.ipify.org',
  full: [],
}
export const getCheckOpts = (): CheckOpts => read<CheckOpts>(OPTS_KEY, DEFAULT_CHECK_OPTS)
export const setCheckOpts = (patch: Partial<CheckOpts>) => {
  const next = { ...getCheckOpts(), ...patch }
  write(OPTS_KEY, next)
  return next
}

// ────────────────────────────────────────────────────────────
// 外观: 素净 (跟随系统) / 自定义 (纯色或图片)
// ────────────────────────────────────────────────────────────
export type Look = {
  mode: 'plain' | 'custom'
  bgType: 'color' | 'image'
  color: Color         // 自定义纯色
  image: string        // 背景图文件路径 (App Group 目录, 小组件能读)
  blur: number         // 0-20
  dim: number          // 0-0.7, 叠一层黑
  accent: Color
  text: 'auto' | 'white' | 'black' | 'custom'
  textColor: Color
}
const LOOK_KEY = 'stashpanel.look'
export const DEFAULT_LOOK: Look = { mode: 'plain', bgType: 'color', color: '#141A2E', image: '', blur: 6, dim: 0.3, accent: '#0A84FF', text: 'auto', textColor: '#FFFFFF' }
export const getLook = () => read<Look>(LOOK_KEY, DEFAULT_LOOK)
export const setLook = (l: Look) => write(LOOK_KEY, l)

export const RECOMMENDED_BG: Color[] = ['#141A2E', '#0B1F3A', '#1D3B2A', '#3A1E2E', '#F2F2F7', '#FFF4E0', '#E8F0FE', '#FDE7EF']
export const RECOMMENDED_ACCENT: Color[] = ['#0A84FF', '#30D158', '#FF9F0A', '#BF5AF2', '#FF375F', '#64D2FF']

// ────────────────────────────────────────────────────────────
// 各尺寸不填参数时用的样式
// ────────────────────────────────────────────────────────────
export type Family = 'systemSmall' | 'systemMedium' | 'systemLarge' | 'accessoryCircular' | 'accessoryRectangular' | 'accessoryInline'
const DEFAULTS_KEY = 'stashpanel.defaults'
export const BUILTIN_DEFAULTS: Record<Family, string> = {
  systemSmall: 'AF', systemMedium: 'REF', systemLarge: 'E', accessoryCircular: 'F', accessoryRectangular: 'F', accessoryInline: 'F',
}
export const getDefaults = () => read<Record<Family, string>>(DEFAULTS_KEY, BUILTIN_DEFAULTS)
export const setDefault = (f: Family, style: string) => write(DEFAULTS_KEY, { ...getDefaults(), [f]: style })

// ────────────────────────────────────────────────────────────
// 自动刷新 (Remote Updates)
// ────────────────────────────────────────────────────────────
const REMOTE_KEY = 'stashpanel.remote'
export const getRemoteTargets = () => read<{ ids: string[] }>(REMOTE_KEY, { ids: [] }).ids
export const setRemoteTargets = (ids: string[]) => write(REMOTE_KEY, { ids })
