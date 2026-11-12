// stash-panel / app_intents.tsx
// 小组件、控制中心按钮的动作 (官方要求全部写在这个文件), 都走 Stash 接口的操作地址

import { AppIntentManager, AppIntentProtocol, Widget, ControlWidget } from 'scripting'

import { setStash, loadStash, activeGroup, ownerGroup, switchTarget, turnGroupPage, turnPickPage, enterPick, leavePick, openPick, closePick, type Hop } from './api'
import { loadSubs } from './subs'
import { getPrefs } from './settings'

const AppStorage = Storage as unknown as {
  get<T = unknown>(key: string): T | null
  set(key: string, value: unknown): void
  remove(key: string): void
}

/** 最近一次按钮操作的结果, 小组件重绘时显示 (失败原因 / 成功提示), 1 分钟后不再显示 */
export const NOTE_KEY = 'stashpanel.note'
export type Note = { t: number; ok: boolean; text: string }
export function readNote(): Note | null {
  const n = AppStorage.get<Note>(NOTE_KEY)
  return n && Date.now() - n.t < 60_000 ? n : null
}

/** 正在切的节点: 点下去先重绘一次, 等 Stash 确认后才显示新节点; 30 秒后不再算数 */
const PENDING_KEY = 'stashpanel.pending'
export function readPending(): { t: number; group: string; node: string } | null {
  const p = AppStorage.get<{ t: number; group: string; node: string }>(PENDING_KEY)
  return p && Date.now() - p.t < 30_000 ? p : null
}

// 小组件按钮在后台跑, 有时间限制 (系统没公开具体秒数, 留足余量)
const TIMEOUT_S = 20

/** via: 上面几层也要指过来, 先切它们 (不复测), 最后一步才复测 */
async function run(q: { mode?: number; group?: string; node?: string }, okText: string, via: Hop[] = []) {
  if (q.group && q.node) {
    AppStorage.set(PENDING_KEY, { t: Date.now(), group: q.group, node: q.node })
    Widget.reloadAll()
  }
  try {
    const { data, error } = await loadStash()
    if (!data || data.stale) throw new Error(error || 'Stash 未连接')
    const hops = [...via, ...(q.group && q.node ? [{ group: q.group, node: q.node }] : [])]
    for (const hop of hops) {
      const group = data.groups.find(g => g.name === hop.group)
      if (!group || !group.subs.includes(hop.node) || (!group.selectable && group.now !== hop.node)) throw new Error('该节点路径含有不可手动选择的策略组')
    }
    for (const v of via) if (data.groups.find(g => g.name === v.group)?.now !== v.node) await setStash({ ...v, quiet: 1 }, TIMEOUT_S)
    await setStash(q, TIMEOUT_S)
    if (q.node) closePick()
    AppStorage.set(NOTE_KEY, { t: Date.now(), ok: true, text: okText })
  } catch (e) {
    AppStorage.set(NOTE_KEY, { t: Date.now(), ok: false, text: (e as Error).message.slice(0, 40) })
  }
  AppStorage.remove(PENDING_KEY)
  Widget.reloadAll()
}

export const ModeIntent = AppIntentManager.register({
  name: 'StashPanelModeIntent',
  protocol: AppIntentProtocol.AppIntent,
  perform: async ({ mode }: { mode: number }) => {
    await run({ mode }, '已切换模式')
  },
})

export const SwitchIntent = AppIntentManager.register({
  name: 'StashPanelSwitchIntent',
  protocol: AppIntentProtocol.AppIntent,
  perform: async ({ group, node, via }: { group: string; node: string; via?: string }) => {
    await run({ group, node }, `${group} → ${node}`, via ? JSON.parse(via) as Hop[] : [])
  },
})

/** 不带参数 = 复测各策略组当前节点 */
export const CheckIntent = AppIntentManager.register({
  name: 'StashPanelCheckIntent',
  protocol: AppIntentProtocol.AppIntent,
  perform: async (_: undefined) => {
    await run({}, '体检完成')
  },
})

/** 右上角刷新: 重读订阅用量, 小组件重绘时再读 Stash */
export const RefreshIntent = AppIntentManager.register({
  name: 'StashPanelRefreshIntent',
  protocol: AppIntentProtocol.AppIntent,
  perform: async (_: undefined) => {
    await loadSubs(true)
    Widget.reloadAll()
  },
})

/** 策略组卡片和看板翻页: step 是 1 或 -1 */
export const TurnGroupsIntent = AppIntentManager.register({
  name: 'StashPanelTurnGroupsIntent',
  protocol: AppIntentProtocol.AppIntent,
  perform: async ({ step }: { step: number }) => {
    turnGroupPage(step)
    Widget.reloadAll()
  },
})

/** 切换器: 点进下层策略组 / 回上一层 */
export const EnterPickIntent = AppIntentManager.register({
  name: 'StashPanelEnterPickIntent',
  protocol: AppIntentProtocol.AppIntent,
  perform: async ({ name }: { name: string }) => {
    enterPick(name)
    Widget.reloadAll()
  },
})

/** 策略组卡片、看板、总览: 点一个组, 这个尺寸的小组件变成切换器 */
export const OpenPickIntent = AppIntentManager.register({
  name: 'StashPanelOpenPickIntent',
  protocol: AppIntentProtocol.AppIntent,
  perform: async ({ group, owner }: { group: string; owner: string }) => {
    openPick(group, owner)
    Widget.reloadAll()
  },
})

export const ClosePickIntent = AppIntentManager.register({
  name: 'StashPanelClosePickIntent',
  protocol: AppIntentProtocol.AppIntent,
  perform: async (_: undefined) => {
    closePick()
    Widget.reloadAll()
  },
})

export const LeavePickIntent = AppIntentManager.register({
  name: 'StashPanelLeavePickIntent',
  protocol: AppIntentProtocol.AppIntent,
  perform: async (_: undefined) => {
    leavePick()
    Widget.reloadAll()
  },
})

export const TurnPickPageIntent = AppIntentManager.register({
  name: 'StashPanelTurnPickPageIntent',
  protocol: AppIntentProtocol.AppIntent,
  perform: async ({ step }: { step: number }) => {
    turnPickPage(step)
    Widget.reloadAll()
  },
})

/** 现在实际走的策略组切到体检最快的节点 */
async function fastest() {
  const { data } = await loadStash()
  const main = data && !data.stale ? activeGroup(data, getPrefs()) : undefined
  const g = main && data ? ownerGroup(data, main) : undefined
  const target = g && data ? switchTarget(data, g) : undefined
  if (g && target) await run({ group: g.name, node: target }, `${g.name} → ${target}`)
  else {
    AppStorage.set(NOTE_KEY, { t: Date.now(), ok: false, text: '没有可切换的节点' })
    Widget.reloadAll()
  }
}

export const FastestIntent = AppIntentManager.register({
  name: 'StashPanelFastestIntent',
  protocol: AppIntentProtocol.AppIntent,
  perform: async (_: undefined) => {
    await fastest()
    ControlWidget.reloadButtons()
  },
})

/** 控制中心开关: 开 = 全局代理, 关 = 分流 */
export const ModeToggleIntent = AppIntentManager.register({
  name: 'StashPanelModeToggleIntent',
  protocol: AppIntentProtocol.AppIntent,
  perform: async ({ value }: { value: boolean }) => {
    await run({ mode: value ? 2 : 1 }, '已切换模式')
    ControlWidget.reloadToggles()
  },
})
