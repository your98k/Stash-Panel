// Stash 版本独立存储；不读取旧版或注入任何凭据。
import type { ServiceInfo, Snapshot } from "./types"

declare const Storage: {
  get<T = unknown>(key: string): T | null
  set<T = unknown>(key: string, value: T): boolean
  remove?(key: string): void
}

const SNAPSHOT_KEY = "stash_radar_snapshot_v1"
const SETTINGS_KEY = "stash_radar_settings_v1"
const SERVICES_KEY = "stash_radar_services_v1"

export type Settings = {
  refreshMinutes: number
  maskIP: boolean
  apiEnabled: boolean
  surgeKey: string
  surgeHost: string
  surgePort: number
  policyGroup: string
}

export const DEFAULT_SETTINGS: Settings = {
  refreshMinutes: 15, maskIP: false, apiEnabled: false,
  surgeKey: "", surgeHost: "127.0.0.1", surgePort: 9090, policyGroup: "",
}

/** 12 个服务的可达性单独缓存，避免每次刷新都重测（这是小组件慢的主因）。 */
export type ServicesCache = { ts: number; media: ServiceInfo[]; ai: ServiceInfo[] }

function readValue<T>(key: string): T | null {
  try {
    const value = Storage.get<any>(key)
    return typeof value === "string" ? JSON.parse(value) : value
  } catch (_) { return null }
}

export function getSettings(): Settings {
  const raw = readValue<Partial<Settings>>(SETTINGS_KEY) || {}
  return {
    refreshMinutes: Math.max(5, Math.min(240, Math.floor(Number(raw.refreshMinutes)) || 15)),
    maskIP: raw.maskIP === true, apiEnabled: raw.apiEnabled === true,
    surgeKey: typeof raw.surgeKey === "string" ? raw.surgeKey.trim() : "",
    surgeHost: typeof raw.surgeHost === "string" && raw.surgeHost.trim() ? raw.surgeHost.trim() : "127.0.0.1",
    surgePort: Number.isInteger(raw.surgePort) && Number(raw.surgePort) > 0 && Number(raw.surgePort) < 65536 ? Number(raw.surgePort) : 9090,
    policyGroup: typeof raw.policyGroup === "string" ? raw.policyGroup.trim() : "",
  }
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch }
  try { Storage.set(SETTINGS_KEY, next) } catch (_) {}
  return next
}

export function getSnapshot(): Snapshot | null {
  const raw = readValue<Snapshot>(SNAPSHOT_KEY)
  return raw && raw.exit && raw.local && typeof raw.ts === "number" ? raw : null
}

export function saveSnapshot(snapshot: Snapshot): void {
  try { Storage.set(SNAPSHOT_KEY, snapshot) } catch (_) {}
}

export function clearSnapshot(): void {
  try {
    Storage.remove?.(SNAPSHOT_KEY)
    Storage.remove?.(SERVICES_KEY)
  } catch (_) {}
}

export function getServicesCache(): ServicesCache | null {
  const raw = readValue<ServicesCache>(SERVICES_KEY)
  if (!raw || typeof raw.ts !== "number" || !Array.isArray(raw.media) || !Array.isArray(raw.ai)) return null
  return raw
}

export function saveServicesCache(cache: ServicesCache): void {
  try { Storage.set(SERVICES_KEY, cache) } catch (_) {}
}

export function isFresh(snapshot: Snapshot | null, minutes: number): boolean {
  return !!snapshot && Date.now() >= snapshot.ts && Date.now() - snapshot.ts < minutes * 60_000
}

export function isOlderThan(ts: number, minutes: number): boolean {
  return !ts || Date.now() - ts > minutes * 60_000
}
