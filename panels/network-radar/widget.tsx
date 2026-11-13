// Stash 小组件：严格限时，先保证出图再补数据。
// 慢的主因是每次刷新都跑 12 个服务探测 + IP 查询（合计 15–20s），WidgetKit 会直接杀掉进程导致白屏。
// 策略：核心数据（IP/延迟）限时 5s；服务可达性单独缓存 60 分钟，只在预算充足时补测。
import { Script, Widget } from "scripting"
import { AI_SERVICES, MEDIA_SERVICES, diagnoseCore, diagnoseServices } from "./src/diagnose"
import { attachServicePolicies, fetchServicePolicies, fetchSurgeState, hostOf } from "./src/surge"
import {
  getServicesCache,
  getSettings,
  getSnapshot,
  isFresh,
  isOlderThan,
  saveServicesCache,
  saveSnapshot,
} from "./src/store"
import { RadarView } from "./src/ui"
import type { Snapshot } from "./src/types"

/** 整轮预算：Core 5.2s + 服务最多 3s + 状态 1.2s，控制在 9.5s 内。 */
const CORE_TIMEOUT = 5200
const SERVICE_TIMEOUT = 3000
const STATE_TIMEOUT = 1800
const SERVICE_TTL_MINUTES = 60

async function withTimeout<T>(promise: Promise<T | null | undefined>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return (await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms)
      }),
    ])) as T | null
  } catch (_) {
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function main() {
  const settings = getSettings()
  const startedAt = Date.now()

  let snapshot = getSnapshot()
  let services = getServicesCache()

  try {
    // 只有核心数据可用且未过期才复用缓存；IP 为空说明上次探测失败，需要重测。
    const usable = !!snapshot && !!snapshot.exit.ip && isFresh(snapshot, settings.refreshMinutes)
    if (!usable) {
      const core = await withTimeout(diagnoseCore(), CORE_TIMEOUT)
      if (core) {
        const merged: Snapshot = {
          ...core,
          media: services?.media || [],
          ai: services?.ai || [],
        }
        snapshot = merged
        saveSnapshot(merged)
      }
    }

    // 服务可达性单独更新：缓存超过 60 分钟且本轮还有预算才测。
    if (snapshot && isOlderThan(services?.ts || 0, SERVICE_TTL_MINUTES)) {
      const spent = Date.now() - startedAt
      const remaining = Math.min(SERVICE_TIMEOUT, 8000 - spent)
      if (remaining > 1500) {
        const fresh = await withTimeout(diagnoseServices(), remaining)
        if (fresh) {
          services = { ts: Date.now(), media: fresh.media, ai: fresh.ai }
          saveServicesCache(services)
          snapshot = { ...snapshot, media: services.media, ai: services.ai }
          saveSnapshot(snapshot)
        }
      }
    }

    // Stash 状态很便宜，但还是限时，避免拖住出图。
    if (snapshot) {
      const state = await withTimeout(fetchSurgeState(settings), STATE_TIMEOUT)
      let next: Snapshot = { ...snapshot, surge: state || undefined }

      if (state) {
        const hosts = [...MEDIA_SERVICES, ...AI_SERVICES].map((item) => hostOf(item.url))
        const hits = (await withTimeout(fetchServicePolicies(settings, hosts), STATE_TIMEOUT)) || new Map()
        const fallback = state.node
          ? { node: state.node, group: state.policy || "", protocol: state.protocol || "" }
          : null
        next = {
          ...next,
          media: attachServicePolicies(next.media, MEDIA_SERVICES, hits, fallback),
          ai: attachServicePolicies(next.ai, AI_SERVICES, hits, fallback),
        }
      }
      snapshot = next
    }
  } catch (_) {
    // 任何异常都不阻止出图，继续用已有缓存渲染。
  }

  Widget.present(
    <RadarView
      snapshot={snapshot}
      settings={settings}
      family={Widget.family ?? "systemLarge"}
      size={Widget.displaySize ?? { width: 338, height: 354 }}
    />,
    { policy: "after", date: new Date(Date.now() + settings.refreshMinutes * 60000) } as any
  )
  Script.exit()
}

main()
