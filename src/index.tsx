// Stash Panel — native HTTP Control API adapter and app UI.
// Widget design and subscription/history calculations adapted from MaYIHEI's Stash Panel.
import {
  Button, Tab, TabView, useObservable, ColorPicker, HStack, Image, Navigation,
  NavigationLink, NavigationStack, Picker, Circle, Slider, Spacer, Text, Toggle,
  VStack, ZStack, Script, Widget, Path, useEffect, useState,
} from 'scripting'
import type { Color } from 'scripting'
import { loadStash, cachedStash, setStash, testNode, sampleStash, activeGroup, healthCount, availability, stashStatus, clearStashCache, MODES, type StashData, type Group } from './api'
import {
  loadSubs, cachedSubs, sampleSubs, listSubs, saveSubs, addSub, updateSub, removeSub,
  setUsage, readNow, subURL, DEFAULT_EVERY, clearHistory, localEvents, parseSubs,
  importSubs, fmtBytes, expireText, type SubView,
} from './subs'
import { Page, Card, Stage, Grid, Block, Panel, StatTile, NavTile, RoundButton, Group as KitGroup, NavRow, ActionRow, InfoRow, PickerRow, ToggleRow } from './kit'
import {
  getApiUrl, setApiUrl, getApiSecret, setApiSecret, getCheckOpts, setCheckOpts,
  getPrefs, setPrefs, getLook, setLook, getDefaults, setDefault,
  RECOMMENDED_BG, RECOMMENDED_ACCENT, type Look, type Family, type Prefs,
} from './settings'
import { chunk, latencyText, ago, usageColor } from './ui'
import { stylesFor, styleById, paramOf, renderStyle, type StyleDef } from './styles/index'

type Shared = { stash: StashData | null; stashErr: string; subs: SubView[]; reload: (force?: boolean) => Promise<void> }
const BOX: Record<Family, { width: number; height: number }> = {
  systemSmall: { width: 158, height: 158 }, systemMedium: { width: 338, height: 158 }, systemLarge: { width: 338, height: 354 },
  accessoryCircular: { width: 76, height: 76 }, accessoryRectangular: { width: 172, height: 76 }, accessoryInline: { width: 172, height: 34 },
}
const FAMILY_NAME: Record<Family, string> = {
  systemSmall: '小号', systemMedium: '中号', systemLarge: '大号', accessoryCircular: '锁屏圆形', accessoryRectangular: '锁屏长条', accessoryInline: '锁屏单行',
}
const BG_PATH = () => Path.join(FileManager.appGroupDocumentsDirectory, 'stash-panel', 'background.jpg')
const messageOf = (e: unknown) => e instanceof Error ? e.message : '操作失败，请重试'

function Preview(p: { style: StyleDef; family: Family; stash: StashData | null; subs: SubView[]; look?: Look; scale?: number }) {
  const box = BOX[p.family], k = p.scale ?? 1, room = p.family.startsWith('system') ? 12 : 0
  const view = renderStyle(p.style, p.family, { inApp: true, stash: p.stash, stashErr: '', subs: p.subs, look: p.look ?? getLook(), prefs: getPrefs(), nat: null, local: localEvents() })
  return <ZStack frame={{ width: box.width * k, height: (box.height + room) * k }}><VStack frame={{ width: box.width, height: box.height + room }} scaleEffect={k}>{view}</VStack></ZStack>
}

function Home() {
  const dismiss = Navigation.useDismiss()
  const tab = useObservable<number>(0)
  const [stash, setData] = useState<StashData | null>(cachedStash())
  const [stashErr, setError] = useState('')
  const [subs, setSubs] = useState<SubView[]>(cachedSubs())
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [, setTick] = useState(0)
  const changed = () => setTick(n => n + 1)
  async function reload(force = false) {
    const [l, s] = await Promise.all([loadStash(), loadSubs(force)])
    setData(l.data); setError(l.error); setSubs(s); changed(); Widget.reloadAll()
  }
  useEffect(() => { reload().catch(() => setNote('刷新失败，请稍后重试')) }, [])
  async function act(q: { mode?: number; group?: string; node?: string }) {
    if (busy) return
    setBusy(true); setNote('处理中…')
    try { setData(await setStash(q)); setError(''); setNote('已完成'); Widget.reloadAll() }
    catch (e) { setNote(messageOf(e)) }
    finally { setBusy(false) }
  }
  const shared: Shared = { stash, stashErr, subs, reload }
  const close = <Button title="关闭" action={dismiss} />
  return <TabView selection={tab}>
    <Tab title="小组件" systemImage="square.grid.2x2.fill" value={0}><NavigationStack><WidgetHome {...shared} close={close} changed={changed} /></NavigationStack></Tab>
    <Tab title="机场" systemImage="airplane" value={1}><NavigationStack><Subscriptions {...shared} close={close} /></NavigationStack></Tab>
    <Tab title="节点" systemImage="antenna.radiowaves.left.and.right" value={2}><NavigationStack><Nodes {...shared} close={close} act={act} busy={busy} note={note} /></NavigationStack></Tab>
    <Tab title="设置" systemImage="gearshape.fill" value={3}><NavigationStack><Settings {...shared} close={close} changed={changed} /></NavigationStack></Tab>
  </TabView>
}

function WidgetHome(p: Shared & { close: any; changed: () => void }) {
  const [note, setNote] = useState('')
  const style = styleById(getDefaults().systemMedium) ?? stylesFor('systemMedium')[0]
  return <Page title="Stash 面板" large bar={{ cancellationAction: p.close }}>
    <Stage><Preview style={style} family="systemMedium" stash={p.stash} subs={p.subs} /></Stage>
    <Block note={p.stashErr || note || '上方显示真实数据。首次使用请在设置中填写 Stash 外部控制地址与密钥。'}>
      <HStack><RoundButton icon="arrow.clockwise" title="刷新数据" action={async () => { setNote('刷新中…'); await p.reload(true); setNote('已刷新') }} /><RoundButton icon="square.and.arrow.up" title="添加小组件" action={async () => { await Dialog.alert({ title: '添加 Stash 小组件', message: '长按桌面 → 添加小组件 → Scripting → 选择 Stash 面板。编辑小组件时可填写样式参数；不填即使用各尺寸默认样式。锁屏同样在自定界面添加。系统决定实际刷新时间。' }) }} /></HStack>
    </Block>
    <Grid>
      <NavTile icon="square.grid.2x2" title="样式库" value="桌面与锁屏" destination={<StyleLibrary {...p} />} />
      <NavTile icon="paintpalette" title="外观" value={getLook().mode === 'plain' ? '跟随系统' : '自定义'} destination={<Appearance {...p} />} />
    </Grid>
    <Panel title="功能范围">
      <Text font={13} foregroundStyle="secondaryLabel">模式切换、手动策略组选择、Stash 原生延迟与历史、多机场用量和小组件。深度 IP／流媒体检测、策略锁定、自动故障转移及远程推送未提供。</Text>
    </Panel>
  </Page>
}

function Nodes(p: Shared & { close: any; act: (q: { mode?: number; group?: string; node?: string }) => Promise<void>; busy: boolean; note: string }) {
  const d = p.stash, status = stashStatus(d), c = d ? healthCount(d) : null
  const g = d ? activeGroup(d, getPrefs()) : undefined
  return <Page title="节点" large bar={{ cancellationAction: p.close }}>
    <Card inner={18}><Text font={23} fontWeight="semibold">{status.text}</Text><Text font={12} foregroundStyle="secondaryLabel">{p.stashErr || p.note || (d ? `${d.version ?? 'Stash'} · 更新 ${ago(d.t)}` : '请先在设置中连接 Stash')}</Text></Card>
    <HStack>{MODES.map(m => <Button title={d?.mode === m.id ? `${m.short} · 当前` : m.short} disabled={!d || d.stale || p.busy || d.mode === m.id} action={() => p.act({ mode: m.id })} buttonStyle="bordered" frame={{ maxWidth: 'infinity' }} />)}</HStack>
    <Grid><StatTile label="已测节点" value={c ? `${c.ok} / ${c.total}` : '—'} sub="原生历史中的可用节点" /><StatTile label="当前节点延迟" value={g && d ? latencyText(d.nodes[g.leaf]) : '—'} sub={g?.leaf} /></Grid>
    {d?.speed ? <Panel title="Stash 实时流量" note="此处是运行累计及瞬时速率，不是机场套餐额度。"><InfoRow icon="arrow.down" title="下载" value={`${fmtBytes(d.speed.downloadTotal ?? 0)} · ${rate(d.speed.download ?? 0)}`} /><InfoRow icon="arrow.up" title="上传" value={`${fmtBytes(d.speed.uploadTotal ?? 0)} · ${rate(d.speed.upload ?? 0)}`} /></Panel> : null}
    <HStack><RoundButton icon="arrow.clockwise" title="刷新" action={() => { p.reload() }} /><RoundButton icon="speedometer" title="测当前节点" disabled={!d || d.stale || p.busy || !g} action={() => p.act({})} /></HStack>
    <KitGroup title="策略组" note="只有 Selector 手动组可切换。自动组只显示成员与原生延迟；检测会发起网络请求。">
      {d?.groups.map(group => <NavRow icon={group.selectable ? 'list.bullet.circle' : 'arrow.triangle.2.circlepath'} title={group.name} sub={`${group.now || '未选择'} · ${group.type ?? '未知类型'}`} destination={<GroupPage shared={p} initial={group} />} />)}
    </KitGroup>
  </Page>
}
function rate(bytes: number) { return bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB/s` : `${(bytes / 1024).toFixed(1)} KB/s` }

function GroupPage(p: { shared: Shared; initial: Group }) {
  const [data, setData] = useState(p.shared.stash!)
  const [prefs, setP] = useState(getPrefs())
  const [busy, setBusy] = useState(false), [note, setNote] = useState('')
  const g = data.groups.find(x => x.name === p.initial.name) ?? p.initial
  const live = !data.stale
  async function run(node: string, check: boolean) {
    if (busy) return
    if (!check && !(await Dialog.confirm({ title: '切换节点', message: `${g.name} → ${node}`, confirmLabel: '切换', cancelLabel: '取消' }))) return
    setBusy(true); setNote(check ? '检测中…' : '切换中…')
    try {
      const next = check ? await testNode(node) : await setStash({ group: g.name, node })
      setData(next); setNote(check ? `${node} · ${latencyText(next.nodes[node])}` : '已切换'); Widget.reloadAll(); await p.shared.reload()
    } catch (e) { setNote(messageOf(e)) } finally { setBusy(false) }
  }
  function update(patch: Partial<Prefs>) { const n = { ...prefs, ...patch }; setP(n); setPrefs(n); Widget.reloadAll() }
  return <Page title={g.name}>
    <Panel title={g.type ?? '策略组'} note={note || (live ? '点击成员行选择，右侧按钮只测延迟，不改变策略。' : '当前为缓存，请返回刷新后操作。')}><Text font={20} fontWeight="semibold">{g.now || '未选择'}</Text><Text font={12} foregroundStyle="secondaryLabel">{`实际节点：${g.leaf}`}</Text></Panel>
    <KitGroup><ToggleRow icon="star" title="常用策略组" value={prefs.groups.includes(g.name)} onChanged={v => update({ groups: v ? [...prefs.groups, g.name] : prefs.groups.filter(n => n !== g.name) })} /><ActionRow icon="pin" title="设为主策略组" value={prefs.main === g.name ? '已设置' : undefined} action={() => update({ main: g.name })} /></KitGroup>
    <KitGroup title="成员" note={g.selectable ? undefined : '此组由 Stash 自动管理，不提供手动选择。'}>
      {g.subs.map(name => {
        const inner = data.groups.find(x => x.name === name), r = data.nodes[inner?.leaf ?? name], a = availability(r)
        return <VStack alignment="leading" spacing={3} padding={12}>
          <HStack spacing={8}><Button action={() => { run(name, false) }} disabled={!g.selectable || !live || busy || g.now === name} buttonStyle="plain"><Text font={14} foregroundStyle={g.now === name ? 'systemBlue' : 'label'} lineLimit={2}>{`${g.now === name ? '✓ ' : ''}${name}`}</Text></Button><Spacer /><Button title={latencyText(r)} disabled={!live || busy} action={() => { run(name, true) }} buttonStyle="bordered" controlSize="small" /></HStack>
          {r?.h?.length ? <Text font={11} foregroundStyle="secondaryLabel" lineLimit={3}>{`历史 ${r.h.map(x => x < 0 ? '超时' : `${x}`).join(' · ')} ms${a === null ? '' : ` · 可用 ${Math.round(a * 100)}%`}`}</Text> : null}
          {inner ? <NavigationLink destination={<GroupPage shared={{ ...p.shared, stash: data }} initial={inner} />}><Text font={12}>查看下层策略组</Text></NavigationLink> : null}
        </VStack>
      })}
    </KitGroup>
  </Page>
}

async function askURL(title: string): Promise<string | null> {
  const value = await Dialog.prompt({ title, message: '订阅链接仅保存在钥匙串，不会写入配置文件。', obscureText: true, keyboardType: 'URL' })
  if (value === null) return null
  const url = value.trim()
  if (!/^https?:\/\//i.test(url)) throw new Error('订阅链接必须以 http:// 或 https:// 开头')
  return url
}
async function askNumber(title: string, current = 0, max = Number.MAX_SAFE_INTEGER): Promise<number | null> {
  const s = await Dialog.prompt({ title, defaultValue: String(current), keyboardType: 'decimalPad' })
  if (s === null) return null
  const n = Number(s.trim())
  if (!s.trim() || !Number.isFinite(n) || n < 0 || n > max) throw new Error('请输入有效的非负数字')
  return n
}
async function fillUsage(s: SubView | { id: string; name: string }) {
  const G = 1024 ** 3, u = 'usage' in s ? s.usage : undefined
  const used = await askNumber('已用流量 (GB)', u ? (u.up + u.down) / G : 0); if (used === null) return
  const total = await askNumber('总流量 (GB)，0 表示不限量', u ? u.total / G : 0); if (total === null) return
  const date = await Dialog.prompt({ title: '到期日期', message: 'YYYY-MM-DD，留空表示无到期日', defaultValue: u?.expire ? new Date(u.expire * 1000).toISOString().slice(0, 10) : '' }); if (date === null) return
  const expire = date.trim() ? Date.parse(`${date.trim()}T23:59:59+08:00`) / 1000 : 0
  if (!Number.isFinite(expire) || (date.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(date.trim()))) throw new Error('日期格式应为 YYYY-MM-DD')
  setUsage(s.id, used * G, total * G, expire)
}

function SubSummary(p: { s: SubView }) {
  const s = p.s
  return <Card inner={16}><HStack><Text font={18} fontWeight="semibold">{s.name}</Text><Spacer /><Text font={15} foregroundStyle={usageColor(s.ratio)}>{s.usage && s.usage.total > 0 ? `${Math.round(s.ratio * 100)}%` : ''}</Text></HStack><Text font={22} fontWeight="semibold" fontDesign="rounded">{s.usage ? s.usage.total > 0 ? `剩余 ${fmtBytes(s.remain)}` : `已用 ${fmtBytes(s.used)}` : '还没有用量'}</Text><Text font={12} foregroundStyle="secondaryLabel">{s.err || `${s.fc.text} · ${expireText(s.usage) || '无到期日'}`}</Text><Text font={11} foregroundStyle="secondaryLabel">{s.usage ? `${s.stale ? '缓存 · ' : ''}更新 ${ago(s.usage.t)} · 今日 ${fmtBytes(s.today)}` : '添加订阅链接或手动填写'}</Text></Card>
}
function Subscriptions(p: Shared & { close: any }) {
  const [note, setNote] = useState(''), [busy, setBusy] = useState(false)
  async function work(fn: () => Promise<void>) { if (busy) return; setBusy(true); try { await fn(); await p.reload(); setNote('已保存') } catch (e) { setNote(messageOf(e)) } finally { setBusy(false) } }
  async function add(manual: boolean) {
    const name = await Dialog.prompt({ title: '机场名称' }); if (!name?.trim()) return
    const url = manual ? '' : await askURL('订阅链接'); if (url === null) return
    const s = addSub(name.trim(), url, manual ? 0 : DEFAULT_EVERY)
    if (manual) await fillUsage(s)
  }
  async function importText(text: string) {
    const found = parseSubs(text)
    if (!found.length) throw new Error('没有找到订阅。支持 Stash proxy-providers YAML、名称 = URL 或逐行 URL。')
    if (!(await Dialog.confirm({ title: `导入 ${found.length} 个订阅？`, message: '只读取用量，不修改 Stash 配置。同名订阅跳过；导入后按 12 小时一次读取。', confirmLabel: '导入', cancelLabel: '取消' }))) return
    const result = importSubs(found, DEFAULT_EVERY)
    await Dialog.alert({ title: '导入完成', message: `新增 ${result.added.length}，同名跳过 ${result.same.length}` })
  }
  return <Page title="机场" large bar={{ cancellationAction: p.close }}>
    <Block note={note || 'Stash API 不返回机场套餐用量；请添加订阅链接或手动填写。链接只存钥匙串，默认 12 小时读取一次；刷新有 30 分钟冷却。'}><HStack><RoundButton icon="plus" title="添加订阅" disabled={busy} action={() => { work(() => add(false)) }} /><RoundButton icon="square.and.pencil" title="手动用量" disabled={busy} action={() => { work(() => add(true)) }} /><RoundButton icon="doc.on.clipboard" title="粘贴导入" disabled={busy} action={() => { work(async () => { const text = await Pasteboard.getString(); if (!text) throw new Error('剪贴板为空'); await importText(text) }) }} /><RoundButton icon="arrow.clockwise" title="刷新" disabled={busy} action={() => { work(() => p.reload(true)) }} /></HStack></Block>
    {p.subs.map(s => <NavigationLink destination={<SubscriptionDetail sub={s} reload={p.reload} />} buttonStyle="plain"><SubSummary s={s} /></NavigationLink>)}
    {!p.subs.length ? <Panel title="尚未添加机场"><Text font={13} foregroundStyle="secondaryLabel">订阅返回 Subscription-Userinfo 时可自动读取。未提供该响应头的机场可手动填写用量。YAML 导入支持常见块状与行内 proxy-providers，不执行 YAML 标签或别名。</Text></Panel> : null}
  </Page>
}
function SubscriptionDetail(p: { sub: SubView; reload: (force?: boolean) => Promise<void> }) {
  const dismiss = Navigation.useDismiss()
  const [s, setS] = useState(p.sub), [note, setNote] = useState(''), [busy, setBusy] = useState(false)
  async function refresh() { await p.reload(); setS(cachedSubs().find(x => x.id === s.id) ?? s); Widget.reloadAll() }
  async function work(fn: () => Promise<void>) { if (busy) return; setBusy(true); try { await fn(); await refresh(); setNote('已保存') } catch (e) { setNote(messageOf(e)) } finally { setBusy(false) } }
  return <Page title={s.name}>
    <SubSummary s={s} />
    <KitGroup note={note || '订阅链接不会显示在界面中。手动读取会绕过正常间隔，请勿频繁操作。'}>
      <ActionRow icon="pencil" title="改名" disabled={busy} action={() => { work(async () => { const name = await Dialog.prompt({ title: '机场名称', defaultValue: s.name }); if (name?.trim()) updateSub(s.id, { name: name.trim() }) }) }} />
      <ActionRow icon="link" title={subURL(s.id) ? '更换订阅链接' : '添加订阅链接'} disabled={busy} action={() => { work(async () => { const url = await askURL('订阅链接'); if (url) updateSub(s.id, { every: s.every || DEFAULT_EVERY }, url) }) }} />
      <PickerRow icon="clock" title="读取间隔" value={s.every} disabled={busy} options={[[0, '仅手动'], [1, '1 小时'], [3, '3 小时'], [6, '6 小时'], [12, '12 小时'], [24, '24 小时']]} onChanged={v => { work(async () => updateSub(s.id, { every: v })) }} />
      <PickerRow icon="person.crop.circle" title="请求身份" value={s.ua ?? ''} disabled={busy} options={[[ '', 'Stash' ], ['clash.meta', 'Clash Meta']]} onChanged={v => { work(async () => updateSub(s.id, { ua: v })) }} />
      <ActionRow icon="arrow.clockwise" title="立即读取用量" disabled={busy || !subURL(s.id)} action={() => { work(async () => { await readNow(s) }) }} />
      <ActionRow icon="square.and.pencil" title="手动填写用量" disabled={busy} action={() => { work(async () => { await fillUsage(s); updateSub(s.id, { every: 0 }) }) }} />
      <ActionRow icon="calendar" title="每月重置日" value={s.resetDay ? `${s.resetDay} 号` : '未设置'} disabled={busy} action={() => { work(async () => { const n = await askNumber('每月重置日，0 表示不设置', s.resetDay, 31); if (n !== null) updateSub(s.id, { resetDay: Math.floor(n) }) }) }} />
      <ActionRow icon="yensign.circle" title="每期价格" value={s.price ? `¥${s.price}` : '未设置'} disabled={busy} action={() => { work(async () => { const n = await askNumber('每期价格', s.price); if (n !== null) updateSub(s.id, { price: n }) }) }} />
      <ActionRow icon="arrow.up" title="设为主订阅" sub="移动到列表首位，供用量环等小组件使用" disabled={busy} action={() => { work(async () => { const all = listSubs(); saveSubs([...all.filter(x => x.id === s.id), ...all.filter(x => x.id !== s.id)]) }) }} />
      <ActionRow icon="trash" color="systemRed" title="删除订阅" disabled={busy} action={() => { work(async () => { if (await Dialog.confirm({ title: '删除订阅？', message: '同时删除此订阅的链接、用量缓存与历史。', confirmLabel: '删除', cancelLabel: '取消' })) { removeSub(s.id); await p.reload(); dismiss() } }) }} />
    </KitGroup>
  </Page>
}

function StyleLibrary(p: Shared & { changed: () => void }) {
  const [family, setFamily] = useState<Family>('systemMedium'), [sample, setSample] = useState(false), [, tick] = useState(0)
  const data = { stash: sample ? sampleStash() : p.stash, subs: sample ? sampleSubs() : p.subs }
  return <Page title="样式库">
    <Picker title="尺寸" value={family} pickerStyle="menu" onChanged={(v: any) => setFamily(v)}>{(Object.keys(FAMILY_NAME) as Family[]).map(f => <Text tag={f}>{FAMILY_NAME[f]}</Text>)}</Picker>
    <Toggle title="示例预览（非真实数据）" value={sample} onChanged={setSample} />
    <Block note="选择样式后点击「用这个样式」，设置默认并复制参数。App 内预览按钮不会改变 Stash 配置。">
      <VStack spacing={20}>{chunk(stylesFor(family), family === 'systemSmall' || family.startsWith('accessory') ? 2 : 1).map(row => <HStack alignment="top" spacing={12}>{row.map(style => <NavigationLink destination={<StyleDetail style={style} family={family} {...data} changed={() => { tick(n => n + 1); p.changed() }} />} buttonStyle="plain"><VStack spacing={7}><Preview style={style} family={family} {...data} scale={family === 'systemLarge' ? 0.9 : 1} /><Text font={13}>{`${style.name}${getDefaults()[family] === style.id ? ' · 默认' : ''}`}</Text></VStack></NavigationLink>)}</HStack>)}</VStack>
    </Block>
  </Page>
}
function StyleDetail(p: { style: StyleDef; family: Family; stash: StashData | null; subs: SubView[]; changed: () => void }) {
  const [note, setNote] = useState('')
  return <Page title={p.style.name}><Stage><Preview {...p} scale={p.family === 'systemLarge' ? 0.9 : 1} /></Stage><Panel title="说明" note={note || `参数：${paramOf(p.style, p.family)}。长按桌面小组件 → 编辑 → 选择 Stash 面板；不填参数使用默认样式。`}><Text font={13}>{p.style.desc}</Text><Button title="用这个样式" buttonStyle="borderedProminent" action={async () => { setDefault(p.family, p.style.id); await Pasteboard.setString(paramOf(p.style, p.family)); Widget.reloadAll(); p.changed(); setNote('已设为该尺寸默认样式，参数已复制') }} /></Panel></Page>
}
function Swatches(p: { colors: Color[]; value: Color; onPick: (v: Color) => void }) {
  return <HStack spacing={8}>{p.colors.map(c => <Button action={() => p.onPick(c)} buttonStyle="plain"><Circle fill={c} frame={{ width: 27, height: 27 }} overlay={<Circle stroke={{ shapeStyle: c === p.value ? 'systemBlue' : 'separator', strokeStyle: { lineWidth: c === p.value ? 3 : 1 } }} />} /></Button>)}</HStack>
}
function Appearance(p: Shared & { changed: () => void }) {
  const [look, setL] = useState<Look>(getLook()), [family, setF] = useState<Family>('systemMedium'), [note, setNote] = useState('')
  const style = styleById(getDefaults()[family]) ?? stylesFor(family)[0]
  function update(patch: Partial<Look>) { const n = { ...look, ...patch }; setL(n); setLook(n); Widget.reloadAll(); p.changed() }
  async function pickImage() {
    try {
      const [img] = await Photos.pickPhotos(1); if (!img) return
      const k = Math.min(1, 1200 / Math.max(img.width, img.height))
      const small = img.preparingThumbnail({ width: Math.round(img.width * k), height: Math.round(img.height * k) }) ?? img
      const jpg = small.toJPEGData(0.85); if (!jpg) throw new Error('图片转换失败')
      await FileManager.createDirectory(Path.join(FileManager.appGroupDocumentsDirectory, 'stash-panel'), true)
      await FileManager.writeAsData(BG_PATH(), jpg); update({ bgType: 'image', image: BG_PATH() }); setNote('')
    } catch { setNote('无法读取或保存背景图片，请检查相册权限') }
  }
  return <Page title="外观"><Stage><Preview style={style} family={family} stash={p.stash} subs={p.subs} look={look} scale={family === 'systemLarge' ? 0.85 : 1} /></Stage>
    <Picker title="预览尺寸" value={family} pickerStyle="segmented" onChanged={(v: any) => setF(v)}><Text tag="systemSmall">小</Text><Text tag="systemMedium">中</Text><Text tag="systemLarge">大</Text></Picker>
    <Panel title="外观"><Picker title="外观" value={look.mode} pickerStyle="segmented" onChanged={(v: any) => update({ mode: v })}><Text tag="plain">跟随系统</Text><Text tag="custom">自定义</Text></Picker></Panel>
    {look.mode === 'custom' ? <VStack spacing={20}>
      <Panel title="背景" note={note || '背景图存储在 App Group，桌面小组件也能读取。'}><Picker title="背景类型" value={look.bgType} pickerStyle="segmented" onChanged={(v: any) => update({ bgType: v })}><Text tag="color">纯色</Text><Text tag="image">图片</Text></Picker>
        {look.bgType === 'color' ? <VStack spacing={12}><Swatches colors={RECOMMENDED_BG} value={look.color} onPick={v => update({ color: v })} /><ColorPicker title="自选背景色" value={look.color} supportsOpacity={false} onChanged={(v: Color) => update({ color: v })} /></VStack> : <VStack spacing={8}><Button title="从相册选择背景" action={pickImage} /><Text font={12}>{`模糊 ${Math.round(look.blur)}`}</Text><Slider min={0} max={20} value={look.blur} onChanged={(v: number) => update({ blur: v })} /><Text font={12}>{`暗化 ${Math.round(look.dim * 100)}%`}</Text><Slider min={0} max={0.7} value={look.dim} onChanged={(v: number) => update({ dim: v })} /></VStack>}
      </Panel>
      <Panel title="文字"><Picker title="文字颜色" value={look.text} pickerStyle="segmented" onChanged={(v: any) => update({ text: v })}><Text tag="auto">自动</Text><Text tag="white">白色</Text><Text tag="black">黑色</Text><Text tag="custom">自选</Text></Picker>{look.text === 'custom' ? <ColorPicker title="文字颜色" value={look.textColor} supportsOpacity={false} onChanged={(v: Color) => update({ textColor: v })} /> : null}</Panel>
      <Panel title="强调色"><Swatches colors={RECOMMENDED_ACCENT} value={look.accent} onPick={v => update({ accent: v })} /><ColorPicker title="强调色" value={look.accent} supportsOpacity={false} onChanged={(v: Color) => update({ accent: v })} /></Panel>
    </VStack> : null}
  </Page>
}

function Settings(p: Shared & { close: any; changed: () => void }) {
  const [note, setNote] = useState(''), [prefs, setP] = useState(getPrefs()), [opts, setO] = useState(getCheckOpts()), [, tick] = useState(0)
  function update(patch: Partial<Prefs>) { const n = { ...prefs, ...patch }; setPrefs(n); setP(n); Widget.reloadAll(); p.changed() }
  async function connection(secret: boolean) {
    try {
      if (secret) {
        const value = await Dialog.prompt({ title: 'Stash 外部控制密钥', message: '仅保存到钥匙串。留空移除密钥。', obscureText: true }); if (value === null) return
        setApiSecret(value)
      } else {
        const value = await Dialog.prompt({ title: 'Stash 外部控制地址', message: '默认 http://127.0.0.1:9090。远程控制建议 HTTPS；不要将密钥放入地址。', defaultValue: getApiUrl(), keyboardType: 'URL' }); if (value === null) return
        setApiUrl(value)
      }
      clearStashCache(); tick(n => n + 1); await p.reload(); setNote('连接设置已保存')
    } catch (e) { setNote(messageOf(e)) }
  }
  return <Page title="设置" large bar={{ cancellationAction: p.close }}>
    <Panel title="Stash HTTP Control API" note={note || '在 Stash 中开启外部控制后连接。密钥只存钥匙串，不写入导出包或日志。HTTP 远程连接会明文传输密钥，请优先使用本机或 HTTPS。'}>
      <Text font={22} fontWeight="semibold">{stashStatus(p.stash).text}</Text><Text font={12} foregroundStyle="secondaryLabel">{`面板 ${Script.metadata.version ?? '1.0.0'}${p.stash?.version ? ` · Stash ${p.stash.version}` : ''}`}</Text>
    </Panel>
    <KitGroup><ActionRow icon="network" title="控制地址" value={getApiUrl()} action={() => { connection(false) }} /><ActionRow icon="key" title="控制密钥" value={getApiSecret() ? '已保存到钥匙串' : '未设置'} action={() => { connection(true) }} /><ActionRow icon="checkmark.circle" title="测试连接（只读）" action={async () => { setNote('连接中…'); const r = await loadStash(); setNote(r.error || `连接成功 · ${r.data?.groups.length ?? 0} 个策略组`); await p.reload() }} /></KitGroup>
    <KitGroup title="小组件" note="刷新时间由 iOS 调度，设置的是请求的最短间隔，不是实时推送。"><PickerRow icon="clock" title="刷新间隔" value={prefs.refresh} options={[[15, '15 分钟'], [30, '30 分钟'], [60, '60 分钟']]} onChanged={v => update({ refresh: v })} /><PickerRow icon="pin" title="主策略组" value={prefs.main} options={[[ '', '自动选择' ], ...(p.stash?.groups.map(g => [g.name, g.name] as [string, string]) ?? [])]} onChanged={v => update({ main: v })} /></KitGroup>
    <KitGroup title="延迟检测" note="使用 Stash 原生节点 delay API；仅点击检测时发起请求，不自动测速或切换。"><PickerRow icon="timer" title="超时" value={opts.timeout} options={[[3000, '3 秒'], [5000, '5 秒'], [8000, '8 秒']]} onChanged={v => setO(setCheckOpts({ timeout: v }))} /><ActionRow icon="link" title="检测 URL" value={opts.test_url} action={async () => { const v = await Dialog.prompt({ title: '延迟检测 URL', defaultValue: opts.test_url, keyboardType: 'URL' }); if (v === null) return; if (!/^https?:\/\//i.test(v.trim())) return setNote('检测 URL 必须以 http(s):// 开头'); setO(setCheckOpts({ test_url: v.trim() })) }} /></KitGroup>
    <KitGroup title="用量提醒（小组件刷新时检查）"><ToggleRow icon="chart.pie" title="已用 80% / 90%" value={prefs.alerts.usage} onChanged={v => update({ alerts: { ...prefs.alerts, usage: v } })} /><ToggleRow icon="hourglass" title="预计 3 天内用完" value={prefs.alerts.runout} onChanged={v => update({ alerts: { ...prefs.alerts, runout: v } })} /><ToggleRow icon="calendar" title="3 天内到期" value={prefs.alerts.expire} onChanged={v => update({ alerts: { ...prefs.alerts, expire: v } })} /></KitGroup>
    <KitGroup title="本机数据"><ActionRow icon="arrow.clockwise" title="清除连接与延迟缓存" action={() => { clearStashCache(); Widget.reloadAll(); setNote('已清除缓存；下次刷新读取 Stash 原生历史') }} /><ActionRow icon="trash" color="systemRed" title="清除全部机场用量历史" action={async () => { if (await Dialog.confirm({ title: '清除用量历史？', message: '趋势和预测会重新记录，订阅链接不受影响。', confirmLabel: '清除', cancelLabel: '取消' })) { clearHistory(); await p.reload(); setNote('历史已清除') } }} /></KitGroup>
  </Page>
}

async function main() { await Navigation.present({ element: <Home />, modalPresentationStyle: 'fullScreen', swipeBackBehavior: 'dismiss' }); Script.exit() }
main()
