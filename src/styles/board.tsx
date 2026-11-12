// stash-panel / styles/board.tsx
// E 全景看板 (大): 模式切换 · 多机场对比 · 策略组当前节点和延迟 (点卡片选节点) · 出口信息

import { VStack, HStack, Text, Spacer, Image, Capsule, Rectangle, RoundedRectangle } from 'scripting'

import { MODES, modeName, groupPage, healthCount, unlockNode, stashStatus, focusOf } from '../api'
import { fmtBytes } from '../subs'
import { ModeIntent, CheckIntent, RefreshIntent, readNote } from '../app_intents'
import { mainGroupLeaf } from './node'
import { PageButton, GroupCell, PickerStyle, Tap } from './net'
import { pct, fcColor, staleMark } from './usage'
import { Root, Logo, Num, Spark, latencyText, latencyInk, nodeLabel, Bar, RefreshButton, chunk, usageColor, mediaColor, flag, syncText, hhmm, Dot, withAlpha, OK, BAD, WARN, type Ctx, type Paint } from '../ui'

// REF: screenshot composition requested by the user; built on MaYIHEI's Scripting
// Stash Panel primitives, adapted for Stash. Runtime totals and subscription quota
// are intentionally separate. Colors follow the shared adaptive/custom appearance.
const REF_GREEN = '#34A853'

/** Stash runtime bytes; unavailable is not a fictional zero. */
function referenceBytes(n?: number): string {
  if (n === undefined || !Number.isFinite(n) || n < 0) return '—'
  if (n === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.max(0, Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024))))
  return `${i === 0 ? Math.round(n) : (n / 1024 ** i).toFixed(1)} ${units[i]}`
}

function ReferenceTotal(p: { ctx: Ctx; icon: string; label: string; color: string; value?: number }) {
  const { th } = p.ctx
  return <VStack alignment="leading" spacing={2} frame={{ maxWidth: 'infinity', height: 49, alignment: 'leading' }}>
    <HStack spacing={4}>
      <Image systemName={p.icon} font={12} foregroundStyle={p.color} />
      <Text font={11} foregroundStyle={th.t2} lineLimit={1}>{p.label}</Text>
    </HStack>
    <Text font={26} fontWeight="bold" monospacedDigit foregroundStyle={th.t1} lineLimit={1} minScaleFactor={0.65}>{referenceBytes(p.value)}</Text>
  </VStack>
}

function ReferenceMetric(p: { ctx: Ctx; icon: string; label: string; value?: string; color?: Paint; children?: any }) {
  const { th } = p.ctx
  return <VStack alignment="leading" spacing={3} frame={{ maxWidth: 'infinity', height: 32, alignment: 'topLeading' }}>
    <HStack spacing={3}>
      <Image systemName={p.icon} font={10} foregroundStyle={th.accent} />
      <Text font={9} foregroundStyle={th.t2} lineLimit={1} minScaleFactor={0.8}>{p.label}</Text>
    </HStack>
    {p.children ?? <Text font={13} fontWeight="bold" monospacedDigit foregroundStyle={p.color ?? th.t1} lineLimit={1} minScaleFactor={0.65}>{p.value}</Text>}
  </VStack>
}

export function ReferenceStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th } = ctx
  const d = ctx.stash
  const sub = ctx.subs[0]
  const u = sub?.usage
  const hasQuota = !!u && Number.isFinite(u.total) && u.total > 0
  const remain = hasQuota ? Math.max(0, u!.total - u!.up - u!.down) : 0
  const percent = hasQuota ? Math.max(0, Math.min(100, Math.round(remain / u!.total * 100))) : null
  const expiry = u?.expire ? Math.ceil((u.expire * 1000 - Date.now()) / 86_400_000) : null
  const expiryText = expiry === null ? '未设到期日' : expiry <= 0 ? '已到期' : `${expiry}天后到期`
  const quotaNote = !sub ? '添加机场订阅后显示额度' : !u ? '尚未读取额度' : `${sub?.stale ? '额度缓存 · ' : ''}${percent === null ? '不限量' : `剩 ${percent}%`} · ${expiryText}`
  const r = mainGroupLeaf(ctx)?.r
  const canSwitch = !!d && !d.stale && !d.mock && !ctx.inApp && d.mode >= 0 && d.mode <= 2
  return <Root ctx={ctx} padding={13} spacing={6}>
    <HStack spacing={5} frame={{ height: 20 }}>
      <Logo size={20} ctx={ctx} />
      <Text font={15} fontWeight="semibold" foregroundStyle={th.t1} lineLimit={1}>Stash</Text>
      <Dot size={5} color={d && !d.stale ? REF_GREEN : '#FF9500'} />
      {!d || d.stale ? <HStack spacing={2}>
        <Image systemName="exclamationmark.triangle.fill" font={8} foregroundStyle="#FF9500" />
        <Text font={9} foregroundStyle={th.t2} lineLimit={1}>{d ? '缓存' : '未连接'}</Text>
      </HStack> : null}
      <Spacer minLength={0} />
      <Text font={10} foregroundStyle={th.t2} lineLimit={1} minScaleFactor={0.75}>{d ? `${d.mock ? '示例 · ' : ''}更新于 ${hhmm(d.t)}` : '更新于 —'}</Text>
      <Tap ctx={ctx} intent={!ctx.inApp ? RefreshIntent(undefined) : undefined}>
        <Image systemName="arrow.clockwise" font={10} fontWeight="semibold" foregroundStyle={th.t2} frame={{ width: 20, height: 20 }} background={<Capsule fill={th.card} />} />
      </Tap>
    </HStack>
    <HStack spacing={12}>
      <ReferenceTotal ctx={ctx} icon="arrow.down.circle.fill" label="累计下行" color={REF_GREEN} value={d?.speed?.downloadTotal} />
      <Rectangle fill={th.border} frame={{ width: 0.5, height: 39 }} />
      <ReferenceTotal ctx={ctx} icon="arrow.up.circle.fill" label="累计上行" color="#FF9500" value={d?.speed?.uploadTotal} />
    </HStack>
    <HStack spacing={5}>
      <ReferenceMetric ctx={ctx} icon="cpu" label="策略组数" value={d ? String(d.groups.length) : '—'} />
      <ReferenceMetric ctx={ctx} icon="link" label="节点延迟" value={!r ? '未测' : !r.ok ? '超时' : `${r.ms} ms`} />
      <ReferenceMetric ctx={ctx} icon="gauge.with.needle" label="剩余流量" value={!sub ? '未添加' : !u ? '未读取' : hasQuota ? referenceBytes(remain) : '不限量'} color={u ? REF_GREEN : th.t2} />
      <ReferenceMetric ctx={ctx} icon="arrow.triangle.branch" label="运行模式">
        <Tap ctx={ctx} intent={canSwitch ? ModeIntent({ mode: (d!.mode + 1) % 3 }) : undefined}>
          <HStack spacing={3} padding={{ horizontal: 7, vertical: 2 }} background={<Capsule fill={withAlpha(th.accent, 0.16)} />}>
            <Text font={11} fontWeight="semibold" foregroundStyle={th.accent} lineLimit={1}>{d ? modeName(d.mode) : '未知'}</Text>
            <Image systemName="arrow.triangle.2.circlepath" font={9} foregroundStyle={th.accent} />
          </HStack>
        </Tap>
      </ReferenceMetric>
    </HStack>
    <HStack spacing={3} frame={{ height: 12 }}>
      <Text font={9} foregroundStyle={th.t2} lineLimit={1} minScaleFactor={0.7}>{u ? `Stash · 总额 ${hasQuota ? referenceBytes(u.total) : '不限量'}` : 'Stash'}</Text>
      <Spacer minLength={0} />
      <Text font={9} foregroundStyle={!u ? th.t2 : sub?.stale || (expiry !== null && expiry <= 0) ? '#D18A00' : REF_GREEN} lineLimit={1} minScaleFactor={0.65}>{quotaNote}</Text>
    </HStack>
  </Root>
}

function Section(props: { ctx: Ctx; title: string; right?: string; trailing?: any }) {
  const { th } = props.ctx
  return (
    <HStack spacing={6}>
      <Text font={10} fontWeight="semibold" foregroundStyle={th.t3}>{props.title}</Text>
      <Rectangle fill={th.border} frame={{ maxWidth: 'infinity', height: 0.5 }} />
      {props.right ? <Text font={10} foregroundStyle={th.t3} lineLimit={1}>{props.right}</Text> : null}
      {props.trailing}
    </HStack>
  )
}

function ModeBar(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th } = ctx
  const cur = ctx.stash?.mode ?? -1
  return (
    <HStack spacing={6}>
      {MODES.map(m => {
        const on = m.id === cur
        return (
          <Tap ctx={ctx} intent={ctx.stash && !ctx.stash.stale && !on ? ModeIntent({ mode: m.id }) : undefined}>
            <HStack spacing={4} padding={{ vertical: 6 }} frame={{ maxWidth: 'infinity' }} background={<Capsule fill={on ? th.accent : th.card} />}>
              <Image systemName={m.icon} font={11} fontWeight="semibold" foregroundStyle={on ? '#FFFFFF' : th.t2} />
              <Text font={12} fontWeight="semibold" foregroundStyle={on ? '#FFFFFF' : th.t2}>{m.name}</Text>
            </HStack>
          </Tap>
        )
      })}
      <Tap ctx={ctx} intent={ctx.stash && !ctx.stash.stale ? CheckIntent(undefined) : undefined}>
        <Image systemName="stethoscope" font={12} fontWeight="semibold" foregroundStyle={th.t2} padding={{ horizontal: 9, vertical: 7 }} background={<Capsule fill={th.card} />} />
      </Tap>
    </HStack>
  )
}

export function BoardStyle(props: { ctx: Ctx }) {
  const { ctx } = props
  const { th, stash } = ctx
  if (stash && !ctx.inApp && focusOf(ctx.size)) return <PickerStyle ctx={ctx} />
  const subs = ctx.subs.slice(0, 2)
  const { list: groups, page, pages } = stash ? groupPage(stash, ctx.prefs, subs.length ? 4 : 6) : { list: [], page: 0, pages: 1 }   // 没有机场时多放一行, 不留空
  const leaf = mainGroupLeaf(ctx)
  const health = stash ? healthCount(stash) : null
  const note = ctx.inApp ? null : readNote()
  const status = stashStatus(stash)
  const unlock = stash ? unlockNode(stash, ctx.prefs) : undefined
  const media = unlock?.list ?? []
  return (
    <Root ctx={ctx} spacing={6}>
      <HStack spacing={6}>
        <Logo size={18} ctx={ctx} />
        <Text font={15} fontWeight="bold" foregroundStyle={th.t1}>Stash 面板</Text>
        <Spacer minLength={4} />
        <Text font={11} foregroundStyle={note ? (note.ok ? OK : BAD) : status.level === 'ok' ? th.t3 : status.level === 'warn' ? WARN : BAD} lineLimit={1}>{note ? note.text : status.level === 'ok' ? syncText(ctx) : status.text}</Text>
        <RefreshButton ctx={ctx} />
      </HStack>

      <ModeBar ctx={ctx} />

      {subs.length ? (
        <VStack spacing={6}>
          <Section ctx={ctx} title="机场" right={ctx.subs.length > 2 ? `共 ${ctx.subs.length} 个` : undefined} />
          {subs.map(s => (
            <HStack spacing={8}>
              <Text font={12} fontWeight="medium" foregroundStyle={th.t1} lineLimit={1} frame={{ width: 64, alignment: 'leading' }}>{`${staleMark(s)}${s.name}`}</Text>
              <VStack alignment="leading" spacing={2} frame={{ maxWidth: 'infinity' }}>
                <HStack>
                  <Text font={10} monospacedDigit foregroundStyle={th.t2} lineLimit={1}>
                    {s.usage ? (s.usage.total > 0 ? `${fmtBytes(s.used)} / ${fmtBytes(s.usage.total)}` : `已用 ${fmtBytes(s.used)}`) : s.err ?? '读取中'}
                  </Text>
                  <Spacer minLength={2} />
                  <Text font={10} fontWeight="medium" foregroundStyle={fcColor(s) ?? th.t3} lineLimit={1}>{s.fc.short}</Text>
                </HStack>
                <Bar ctx={ctx} value={s.ratio} color={usageColor(s.ratio)} height={4} />
              </VStack>
              <Text font={12} fontWeight="semibold" monospacedDigit foregroundStyle={th.t1} frame={{ width: 36, alignment: 'trailing' }}>{s.usage && s.usage.total > 0 ? pct(s.ratio) : '∞'}</Text>
            </HStack>
          ))}
        </VStack>
      ) : null}
      <Section ctx={ctx} title="策略组" right={health && health.total ? `${health.ok}/${health.total} 可用` : undefined} trailing={<PageButton ctx={ctx} page={page} pages={pages} />} />
      {stash ? (
        <VStack spacing={6}>
          {chunk(groups, 2).map(row => (
            <HStack spacing={6}>
              {row.map(g => <GroupCell ctx={ctx} g={g} />)}
              {row.length < 2 ? <Spacer /> : null}
            </HStack>
          ))}
        </VStack>
      ) : (
        <Text font={11} foregroundStyle={th.t3}>读不到 Stash 数据, 打开 App 看排查步骤</Text>
      )}

      <Spacer minLength={0} />
      {leaf ? (
        <VStack spacing={3} padding={{ horizontal: 10, vertical: 6 }} background={<RoundedRectangle cornerRadius={12} style="continuous" fill={th.card} />}>
          {subs.length > 1 ? null : (
            <HStack spacing={8}>
              <Num value={latencyText(leaf.r)} size={20} color={latencyInk(ctx, leaf.r)} />
              <Text font={10} foregroundStyle={th.t3} lineLimit={1}>{nodeLabel(leaf.name, leaf.r)}</Text>
              <Spacer minLength={4} />
              <Spark ctx={ctx} h={leaf.r?.h} width={96} height={20} tone={th.accent} />
            </HStack>
          )}
          <HStack spacing={6}>
            <Text font={10} foregroundStyle={th.t2} lineLimit={1}>{`当前 · ${leaf.group}`}</Text>
            <Spacer minLength={4} />
            <Text font={10} fontWeight="semibold" monospacedDigit foregroundStyle={th.t3} lineLimit={1} minScaleFactor={0.7}>{`Stash ${stash?.version ?? ''}`.trim()}</Text>
          </HStack>
          {unlock && media.length ? (
            <HStack spacing={5}>
              <Text font={10} foregroundStyle={th.t2} lineLimit={1}>{`解锁 · ${unlock.group}`}</Text>
              <Spacer minLength={4} />
              {media.length
                ? media.slice(0, 4).map(m => <Text font={10} fontWeight="medium" foregroundStyle={mediaColor(m)} lineLimit={1} minScaleFactor={0.7}>{m.name}</Text>)
                : <Text font={10} foregroundStyle={th.t3} lineLimit={1}>还没检测</Text>}
            </HStack>
          ) : null}
        </VStack>
      ) : null}
    </Root>
  )
}
