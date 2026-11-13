import { Button, HStack, List, Navigation, NavigationStack, Script, Section, Spacer, Text, TextField, Toggle, Widget, useEffect, useState } from "scripting"
import { AI_SERVICES, MEDIA_SERVICES, diagnose } from "./src/diagnose"
import { agoLabel, maskIP } from "./src/net"
import { clearSnapshot, getSettings, getSnapshot, saveServicesCache, saveSettings, saveSnapshot } from "./src/store"
import type { Settings } from "./src/store"
import { attachServicePolicies, fetchServicePolicies, hostOf, readSurgeState } from "./src/surge"
import type { Snapshot, SurgeInfo } from "./src/types"

function Row({ label, value }: { label: string; value: string }) {
  return <HStack><Text>{label}</Text><Spacer /><Text>{value || "—"}</Text></HStack>
}

function RadarPage() {
  const [settings, setSettings] = useState<Settings>(getSettings())
  const [snapshot, setSnapshot] = useState<Snapshot | null>(getSnapshot())
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")
  const [state, setState] = useState<SurgeInfo | null>(null)
  const [status, setStatus] = useState("未读取")
  const [detail, setDetail] = useState("")

  useEffect(() => { void refresh() }, [])

  async function refresh() {
    setStatus("读取中…")
    const result = await readSurgeState(getSettings())
    setState(result.info)
    setStatus(result.error || "已连接")
    setDetail(result.detail)
  }

  async function runDiagnose() {
    setLoading(true)
    try {
      const result = await diagnose()
      let next = result
      saveServicesCache({ ts: result.ts, media: result.media, ai: result.ai })
      const current = getSettings()
      try {
        const hits = await fetchServicePolicies(
          current,
          [...MEDIA_SERVICES, ...AI_SERVICES].map((item) => hostOf(item.url))
        )
        const state2 = await readSurgeState(current)
        if (state2.info) next = { ...next, surge: state2.info }
        const fallback = state2.info?.node
          ? { node: state2.info.node, group: state2.info.policy || "", protocol: state2.info.protocol || "" }
          : null
        next = {
          ...next,
          media: attachServicePolicies(next.media, MEDIA_SERVICES, hits, fallback),
          ai: attachServicePolicies(next.ai, AI_SERVICES, hits, fallback),
        }
      } catch (_) {}
      saveSnapshot(next)
      setSnapshot(next)
      Widget.reloadAll()
      setMessage("自测完成；可达仅代表 HTTP 响应，不代表解锁或播放能力。")
      await refresh()
    } catch (_) {
      setMessage("诊断失败，请检查网络后重试。")
    } finally {
      setLoading(false)
    }
  }

  function update(patch: Partial<Settings>) {
    setSettings(saveSettings(patch))
    setState(null)
    setStatus("设置已更改，请重新读取")
    setDetail("")
  }

  const exit = snapshot?.exit
  const sourceLabel =
    state?.source === "connections" ? "活跃连接实测" : state?.source === "policy-chain" ? "策略组链" : state?.source === "direct" ? "全部直连" : ""

  return <NavigationStack><List navigationTitle="Stash 网络诊断雷达">
    <Section header={<Text>本机自测出口</Text>} footer={<Text>{snapshot ? `本机自测 · ${agoLabel(snapshot.ts)}；各探测域名可能由不同规则出站，IP 数据和评分仅供参考。` : "点击立即诊断获取数据。"}</Text>}>
      <Row label="出口 IP" value={settings.maskIP ? maskIP(exit?.ip || "") : exit?.ip || ""} />
      <Row label="地区" value={[exit?.country, exit?.city].filter(Boolean).join(" · ")} />
      <Row label="运营商" value={exit?.isp || ""} />
      <Row label="ASN" value={exit?.asn || ""} />
      <Row label="参考评分" value={exit ? `${exit.purity} · ${exit.risk}` : "未知"} />
    </Section>
    <Section header={<Text>链路</Text>} footer={<Text>延迟为 HTTP 请求耗时，不保证代理或直连；没有 STUN / QUIC 测试证据。</Text>}>
      <Row label="本地网络" value={snapshot?.local.net || ""} />
      <Row label="内网 IP" value={settings.maskIP ? maskIP(snapshot?.local.ip || "") : snapshot?.local.ip || ""} />
      <Row label="海外站延迟" value={snapshot?.lat.proxy ? `${snapshot.lat.proxy} ms` : "未知/超时"} />
      <Row label="国内站延迟" value={snapshot?.lat.local ? `${snapshot.lat.local} ms` : "未知/超时"} />
      <Row label="NAT / QUIC" value="未知 / 未知" />
    </Section>
    <Section header={<Text>Stash 只读状态</Text>} footer={<Text>{detail || "只读取 /configs、/proxies、/connections，不修改配置。"}</Text>}>
      <Row label="API" value={status} />
      <Row label="模式" value={state?.mode || "未知"} />
      <Row label="当前出口节点" value={state?.node || "未知"} />
      <Row label="策略组" value={state?.policy || ""} />
      <Row label="协议类型" value={state?.protocol || ""} />
      <Row label="数据来源" value={sourceLabel} />
      <Row label="活跃连接" value={typeof state?.active === "number" ? `${state.active} 条` : "未知"} />
      <Button title="重新读取" action={refresh} />
    </Section>
    {[{ name: "流媒体网页可达性", items: snapshot?.media }, { name: "AI 网页可达性", items: snapshot?.ai }].map(group =>
      <Section key={group.name} header={<Text>{group.name}</Text>} footer={<Text>仅 HTTP 响应；403 / 429 可能为风控，不能据此断定地区解锁。名字后的节点为活跃连接实测出口；没有实测记录时显示当前出口节点。</Text>}>
        {(group.items || []).map(item => <Row key={item.id} label={item.policy ? `${item.name} · ${item.policy}` : item.name} value={`${item.ok ? "可达" : item.status ? "受限/错误" : "无响应"} · ${item.status || "未知"}`} />)}
      </Section>
    )}
    <Section header={<Text>操作</Text>} footer={<Text>{message}</Text>}>
      <Button title="刷新小组件" action={() => { Widget.reloadAll(); setMessage("已请求刷新小组件；iOS 会在下次调度时重绘。") }} />
      <Button title={loading ? "诊断中…" : "立即诊断"} action={runDiagnose} disabled={loading} />
      <Button title="预览大号小组件" action={() => Widget.preview({ family: "systemLarge" })} />
      <Button title="清空缓存" role="destructive" action={() => { clearSnapshot(); setSnapshot(null); Widget.reloadAll() }} />
    </Section>
    <Section header={<Text>小组件设置</Text>} footer={<Text>刷新由 iOS 调度，不保证准时；无需安装覆写或配套脚本。</Text>}>
      <TextField title="刷新间隔（分钟）" value={String(settings.refreshMinutes)} onChanged={value => { const n = Number(value); if (n >= 5 && n <= 240) update({ refreshMinutes: Math.floor(n) }) }} />
      <Toggle title="显示时打码 IP" value={settings.maskIP} onChanged={value => update({ maskIP: value })} />
    </Section>
    <Section header={<Text>Stash Clash API</Text>} footer={<Text>填写你已有的外部控制地址和 secret。默认不启用、不带凭据；secret 仅在本机脚本 Storage 保存（非钥匙串），勿分享配置。建议仅用本机地址，HTTP 跨网不加密。留空「观察策略组」时自动采用活跃连接中出现最多的那个组。</Text>}>
      <Toggle title="启用只读 API" value={settings.apiEnabled} onChanged={value => update({ apiEnabled: value })} />
      <TextField title="Bearer secret" value={settings.surgeKey} onChanged={value => update({ surgeKey: value })} />
      <TextField title="地址（不含协议）" value={settings.surgeHost} onChanged={value => update({ surgeHost: value })} />
      <TextField title="端口" value={String(settings.surgePort)} onChanged={value => { const port = Number(value); if (Number.isInteger(port) && port > 0 && port < 65536) update({ surgePort: port }) }} />
      <TextField title="观察策略组（留空自动）" value={settings.policyGroup} onChanged={value => update({ policyGroup: value })} />
    </Section>
  </List></NavigationStack>
}

async function run() { await Navigation.present(<RadarPage />); Script.exit() }
run()
