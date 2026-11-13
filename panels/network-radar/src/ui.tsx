// 小组件 UI：参考 Egern「网络诊断雷达」的排版（两栏卡片 + 服务网格 + 底部指标条），
// 深色模式保留暗灰配色，浅色模式切换为浅底和深色文字。
import { Circle, HStack, Image, Path, Rectangle, Script, Spacer, Text, VStack, VirtualNode, Widget, ZStack, modifiers } from "scripting"
import type { ServiceInfo, Snapshot } from "./types"
import { agoLabel, countryCode, maskIP } from "./net"
import type { Settings } from "./store"

export type Size = { width: number; height: number }

// 运行时支持 light/dark 动态样式；当前 Scripting TypeScript 定义仍把这些属性标成 ShapeStyle，
// 因此在这个边界收窄类型检查，保留原样式对象传给运行时解析。
const adaptive = (light: string, dark: string): any => ({ light, dark })

const C = {
  // 大号窗口：比全局底色略亮一档，和外框形成「窗台 + 窗面」的层次
  card: adaptive("#FFFFFF", "#35353A"),
  soft: adaptive("#EEF0F5", "#3E3E45"),
  line: adaptive("rgba(60,60,67,0.16)", "rgba(255,255,255,0.07)"),
  text: adaptive("#1C1C1E", "#F5F5F7"),
  sub: adaptive("#5D5D66", "#A6A6AE"),
  dim: adaptive("#82828A", "#7B7B84"),
  green: adaptive("#16803C", "#32D74B"),
  amber: adaptive("#A15C00", "#FF9F0A"),
  red: adaptive("#D72638", "#FF453A"),
  blue: adaptive("#0066CC", "#0A84FF"),
  purple: adaptive("#7C3AED", "#BF5AF2"),
  teal: adaptive("#007E8A", "#40CBE0"),
  orange: adaptive("#A15C00", "#FF9F0A"),
  pink: adaptive("#D81B60", "#FF375F"),
  iconSurface: adaptive("rgba(60,60,67,0.08)", "rgba(255,255,255,0.06)"),
  subtleSurface: adaptive("rgba(60,60,67,0.07)", "rgba(255,255,255,0.08)"),
  blueTint: adaptive("rgba(0,102,204,0.10)", "rgba(10,132,255,0.16)"),
  greenTint: adaptive("rgba(22,128,60,0.10)", "rgba(50,215,75,0.16)"),
  redTint: adaptive("rgba(215,38,56,0.10)", "rgba(255,69,58,0.16)"),
  ringTrack: adaptive("rgba(60,60,67,0.16)", "rgba(255,255,255,0.14)"),
} as const

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]

/* ------------------------------------------------------------------ */
/* 数据小工具                                                          */
/* ------------------------------------------------------------------ */

function purityColor(score: number): any {
  if (score >= 75) return C.green
  if (score >= 45) return C.amber
  return C.red
}

function riskColor(risk: string): any {
  if (risk === "低风险") return C.green
  if (risk === "中风险") return C.amber
  if (risk === "高风险") return C.red
  return C.dim
}

function latencyColor(ms: number): any {
  if (!ms) return C.red
  if (ms <= 220) return C.green
  if (ms <= 500) return C.amber
  return C.red
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

function clockLabel(ts: number): string {
  const date = new Date(ts || Date.now())
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function dateLabel(ts: number): string {
  const date = new Date(ts || Date.now())
  return `${pad2(date.getMonth() + 1)}/${pad2(date.getDate())} ${WEEKDAYS[date.getDay()]}`
}

function shortArea(area: string): string {
  const parts = String(area || "")
    .replace(/中国大陆|中国/g, " ")
    .split(/\s+/)
    .filter(Boolean)
  if (!parts.length) return "中国大陆"
  const unique: string[] = []
  for (const part of parts) {
    if (!unique.includes(part)) unique.push(part)
  }
  return unique.slice(-2).join(" ")
}

function localFlagCode(area: string, net: string): string {
  if (/中国|中国大陆/.test(String(area || ""))) return "CN"
  if (/WiFi|蜂窝|其他/.test(net)) return ""
  return ""
}

function shortIsp(value: string): string {
  const text = String(value || "").trim()
  if (!text) return "未知"
  if (/china mobile|cmcc/i.test(text)) return "中国移动"
  if (/china unicom|unicom/i.test(text)) return "中国联通"
  if (/china telecom|chinanet/i.test(text)) return "中国电信"
  if (/oracle/i.test(text)) return "Oracle"
  if (/chunghwa|hinet/i.test(text)) return "中华电信"
  if (/taiwan mobile|taiwanmobile/i.test(text)) return "台湾大哥大"
  if (/kddi|ntt/i.test(text)) return "KDDI"
  if (/softbank/i.test(text)) return "SoftBank"
  if (/amazon|aws/i.test(text)) return "AWS"
  if (/google/i.test(text)) return "Google"
  if (/cloudflare/i.test(text)) return "Cloudflare"
  if (/digitalocean/i.test(text)) return "DigitalOcean"
  if (/microsoft|azure/i.test(text)) return "Azure"
  if (/tencent/i.test(text)) return "腾讯云"
  if (/alibaba|aliyun/i.test(text)) return "阿里云"
  const first = text.split(/[,，]/)[0].split(/\s{2,}/)[0]
  return first.length > 12 ? `${first.slice(0, 11)}…` : first
}

function shortProtocol(protocol: string): string {
  const text = String(protocol || "").trim()
  if (!text) return "—"
  return text.length > 8 ? `${text.slice(0, 8)}` : text
}

/** 节点名里常带国旗/图标，有的字体渲染成方框，显示前清一下 */
function prettyName(value: string): string {
  const raw = String(value || "").trim()
  if (!raw) return ""
  const stripped = raw
    .replace(/[\u{1F000}-\u{1FAFF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "")
    .replace(/[\u{E0020}-\u{E007F}]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
  return stripped || raw
}

/** 小组件里的节点名要更短：去旗帜/倍率，截断到 10 字 */
function shortNode(value: string): string {
  const name = prettyName(value)
    .replace(/^所选[:：]\s*/, "")
    .replace(/\s*[0-9.]+\s*x\s*$/i, "")
    .replace(/[|｜·].*$/, "")
    .trim()
  if (!name) return ""
  return name.length > 10 ? `${name.slice(0, 10)}…` : name
}

/* ------------------------------------------------------------------ */
/* 原子组件                                                            */
/* ------------------------------------------------------------------ */

function Tag({ text, color = C.sub, bg = C.subtleSurface }: { text: string; color?: any; bg?: any }): VirtualNode {
  return (
    <Text
      font={6.5}
      fontWeight="semibold"
      foregroundStyle={color}
      lineLimit={1}
      padding={{ horizontal: 4, vertical: 1 }}
      widgetBackground={{ style: bg, shape: { type: "rect", cornerRadius: 3 } }}
    >
      {text}
    </Text>
  )
}

function IconBox({
  symbol,
  color = C.blue,
  size = 22,
  radius = 7,
  bg = C.soft,
  children,
}: {
  symbol?: string
  color?: any
  size?: number
  radius?: number
  bg?: any
  children?: VirtualNode | VirtualNode[]
}): VirtualNode {
  // 注意：Scripting 的 JSX 对自闭合标签会传 children = []，空数组是真值，必须判长度
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children)

  return (
    <VStack
      alignment="center"
      frame={{ width: size, height: size }}
      widgetBackground={{ style: bg, shape: { type: "rect", cornerRadius: radius } }}
    >
      {hasChildren ? children : <Image systemName={symbol || "circle"} font={size * 0.5} foregroundStyle={color} />}
    </VStack>
  )
}

/* Surge 官方图标：App Store 取 512px 原图，去掉白底、裁到图形边界，存两份：
   项目 assets/（随脚本同步）+ App Group（小组件直读）。缺失时退回下面手绘的 SurgeMark。 */
declare const FileManager: any
declare const UIImage: any

let logoCache: any = null
let logoTried = false

/** 本地资源图片必须经 UIImage.fromFile 才能渲染（直接 Image filePath 在小组件里不出图）。小图片缓存一次即可。 */
function surgeLogo(): any {
  if (logoTried) return logoCache
  logoTried = true

  const candidates: string[] = []
  try {
    candidates.push(Path.join(Script.directory, "assets", "surge-logo.png"))
  } catch (_) {}
  try {
    candidates.push(`${FileManager.appGroupDocumentsDirectory}/surge-logo.png`)
  } catch (_) {}

  for (const path of candidates) {
    try {
      if (!FileManager.existsSync(path)) continue
      const image = UIImage.fromFile(path)
      if (image) {
        logoCache = image
        break
      }
    } catch (_) {}
  }

  return logoCache
}

let flagTried: Record<string, boolean> = {}
let flagCache: Record<string, any> = {}

function countryFlagImage(value: string): { code: string; image: any } {
  const code = countryCode(value)
  if (!code || code === "TW") return { code, image: null }
  if (flagTried[code]) return { code, image: flagCache[code] || null }
  flagTried[code] = true

  try {
    const path = Path.join(Script.directory, "assets", "flags", `${code}.png`)
    if (FileManager.existsSync(path)) flagCache[code] = UIImage.fromFile(path)
  } catch (_) {}

  return { code, image: flagCache[code] || null }
}

function CountryFlag({ value, size }: { value: string; size: number }): VirtualNode {
  const { code, image } = countryFlagImage(value)
  if (!code || code === "TW") return <VStack frame={{ width: 0, height: 0 }} />
  if (!image) {
    return (
      <Text font={Math.max(7, size * 0.68)} fontWeight="bold" foregroundStyle={C.blue}>
        {code}
      </Text>
    )
  }
  return (
    <Image
      image={image}
      resizable
      frame={{ width: size * 1.32, height: size }}
      widgetAccentedRenderingMode="fullColor"
    />
  )
}

function SurgeBadge({ size = 26 }: { size?: number }): VirtualNode {
  return <IconBox symbol="network" size={size} radius={8} bg={C.iconSurface} />
}

/* 手绘兼底版本：五根胶囊竖条 */
type SurgeBar = { top: number; height: number; colors: string[] }

const SURGE_BARS: SurgeBar[] = [
  { top: 0.55, height: 0.32, colors: ["#9C8CF0", "#C77DE0", "#D98BC8"] },
  { top: 0.38, height: 0.55, colors: ["#5D9EF2", "#A87FE8", "#EDA062"] },
  { top: 0.09, height: 0.83, colors: ["#4E9CF0", "#9A85EE", "#F4A55C"] },
  { top: 0.0, height: 0.65, colors: ["#4E9CF0", "#A47EEA", "#CE7FCB"] },
  { top: 0.24, height: 0.33, colors: ["#6FAAF5", "#B47FE4"] },
]

function SurgeMark({ size }: { size: number }): VirtualNode {
  const barWidth = size * 0.1
  const gap = size * 0.093

  return (
    <HStack alignment="center" spacing={gap} frame={{ height: size }}>
      {SURGE_BARS.map((bar, index) => {
        const bottom = Math.max(0, 1 - bar.top - bar.height)
        return (
          <VStack key={`surge-col-${index}`} spacing={0} frame={{ width: barWidth }}>
            <VStack frame={{ width: barWidth, height: size * bar.top }} />
            <VStack
              frame={{ width: barWidth, height: size * bar.height }}
              background={{
                style: { colors: bar.colors, startPoint: "top", endPoint: "bottom" } as any,
                shape: { type: "capsule", style: "continuous" },
              }}
            />
            <VStack frame={{ width: barWidth, height: size * bottom }} />
          </VStack>
        )
      })}
    </HStack>
  )
}

function Card({
  children,
  width,
  height,
  spacing = 0,
  pad = 8,
}: {
  children?: VirtualNode | VirtualNode[]
  width: number
  height: number
  spacing?: number
  pad?: number
}): VirtualNode {
  return (
    <VStack
      alignment="leading"
      spacing={spacing}
      padding={pad}
      frame={{ width, height, alignment: "topLeading" }}
      widgetBackground={{ style: C.card, shape: { type: "rect", cornerRadius: 12 } }}
      border={{ style: C.line, width: 0.5 }}
    >
      {children}
    </VStack>
  )
}

function Mini({ label, value, color = C.text, width }: { label: string; value: string; color?: any; width: number }): VirtualNode {
  return (
    <VStack alignment="leading" spacing={0.5} frame={{ width, alignment: "leading" }}>
      <Text font={5.8} foregroundStyle={C.dim} lineLimit={1}>
        {label}
      </Text>
      <Text font={7.6} fontWeight="semibold" foregroundStyle={color} lineLimit={1} minScaleFactor={0.7}>
        {value}
      </Text>
    </VStack>
  )
}

function FooterCell({
  symbol,
  color,
  label,
  value,
  width,
}: {
  symbol: string
  color: any
  label: string
  value: string
  width: number
}): VirtualNode {
  return (
    <HStack spacing={4} frame={{ width, alignment: "leading" }}>
      <IconBox symbol={symbol} color={color} size={16} radius={5} />
      <VStack alignment="leading" spacing={0.5} frame={{ maxWidth: "infinity", alignment: "leading" }}>
        <Text font={5.8} foregroundStyle={C.dim} lineLimit={1}>
          {label}
        </Text>
        <Text font={7.6} fontWeight="semibold" foregroundStyle={C.text} lineLimit={1} minScaleFactor={0.65}>
          {value}
        </Text>
      </VStack>
    </HStack>
  )
}

/* 品牌徽标 */
const BRAND: Record<string, { text?: string; symbol?: string; color: any }> = {
  netflix: { text: "N", color: "#FF3B30" },
  disney: { text: "D+", color: "#5E8BFF" },
  spotify: { symbol: "waveform", color: C.green },
  tiktok: { symbol: "music.note", color: C.text },
  youtube: { symbol: "play.rectangle.fill", color: "#FF453A" },
  prime: { text: "P", color: C.blue },
  chatgpt: { symbol: "circle.hexagongrid.fill", color: "#30D5A0" },
  claude: { text: "A", color: "#E0805C" },
  gemini: { symbol: "sparkles", color: "#8E7CFF" },
  deepseek: { text: "D", color: "#5B7CFA" },
  grok: { text: "X", color: C.text },
  perplexity: { symbol: "magnifyingglass", color: C.teal },
}

/* 品牌图标：各服务官网 favicon（128px 原图，存 assets/logos/），用 UIImage 读入后缓存 */
let brandTried: Record<string, boolean> = {}
let brandCache: Record<string, any> = {}

function brandLogo(id: string): any {
  if (brandTried[id]) return brandCache[id]
  brandTried[id] = true

  try {
    const path = Path.join(Script.directory, "assets", "logos", `${id}.png`)
    if (FileManager.existsSync(path)) {
      const image = UIImage.fromFile(path)
      if (image) brandCache[id] = image
    }
  } catch (_) {}

  return brandCache[id]
}

function BrandBadge({ id, size }: { id: string; size: number }): VirtualNode {
  const brand = BRAND[id] || { text: id.slice(0, 1).toUpperCase(), color: C.sub }
  const logo = brandLogo(id)

  return (
    <VStack
      alignment="center"
      frame={{ width: size, height: size }}
      widgetBackground={{ style: C.iconSurface, shape: { type: "rect", cornerRadius: 5 } }}
    >
      {logo ? (
        <Image image={logo} resizable frame={{ width: size * 0.74, height: size * 0.74 }} widgetAccentedRenderingMode="fullColor" />
      ) : brand.symbol ? (
        <Image systemName={brand.symbol} font={size * 0.5} foregroundStyle={brand.color} />
      ) : (
        <Text font={id === "disney" ? 7.5 : 9.5} fontWeight="bold" foregroundStyle={brand.color}>
          {brand.text || ""}
        </Text>
      )}
    </VStack>
  )
}

function ServiceItem({ service, width, height }: { service: ServiceInfo; width: number; height: number }): VirtualNode {
  const ok = service.ok
  const color = ok ? C.green : C.red
  const detail = service.policy
    ? shortNode(service.policy)
    : ok
      ? "可达"
      : service.status
        ? "受限"
        : "失败"

  return (
    <HStack spacing={5} frame={{ width, height, alignment: "leading" }}>
      <BrandBadge id={service.id} size={height - 6} />
      <VStack alignment="leading" spacing={0.5} frame={{ maxWidth: "infinity", alignment: "leading" }}>
        <Text font={8} fontWeight="semibold" foregroundStyle={C.text} lineLimit={1} minScaleFactor={0.7}>
          {service.name}
        </Text>
        <HStack spacing={2}>
          <Text font={6.2} fontWeight="bold" foregroundStyle={color}>
            {ok ? "✓" : "✕"}
          </Text>
          <Text font={6.2} foregroundStyle={service.policySource === "connections" ? C.teal : C.sub} lineLimit={1} minScaleFactor={0.6}>
            {detail}
          </Text>
        </HStack>
      </VStack>
    </HStack>
  )
}

function ServiceCard({
  title,
  symbol,
  color,
  items,
  width,
  height,
}: {
  title: string
  symbol: string
  color: any
  items: ServiceInfo[]
  width: number
  height: number
}): VirtualNode {
  const inner = width - 16
  const okCount = items.filter((item) => item.ok).length
  const per = items.length > 6 ? 6 : items.length || 6
  const colWidth = (inner - 6) / 2
  const itemHeight = 24
  const rows: ServiceInfo[][] = []
  for (let i = 0; i < per; i += 2) rows.push(items.slice(i, i + 2))

  return (
    <Card width={width} height={height} spacing={4} pad={8}>
      <HStack spacing={3} frame={{ width: inner, height: 12 }}>
        <Image systemName={symbol} font={8} foregroundStyle={color} />
        <Text font={8.6} fontWeight="semibold" foregroundStyle={C.text} lineLimit={1}>
          {title}
        </Text>
        <Spacer />
        <Tag text={`${okCount}/${items.length}`} color={okCount === items.length ? C.green : C.amber} />
      </HStack>

      {items.length === 0 ? (
        <VStack alignment="center" spacing={2} frame={{ width: inner, height: 82 }}>
          <Text font={7.6} foregroundStyle={C.dim} lineLimit={1}>
            尚未探测
          </Text>
          <Text font={6.4} foregroundStyle={C.dim} lineLimit={1}>
            下次刷新自动补全
          </Text>
        </VStack>
      ) : (
        <VStack alignment="leading" spacing={2} frame={{ width: inner, alignment: "topLeading" }}>
          {rows.map((row, index) => (
            <HStack key={`row-${index}`} spacing={6} frame={{ width: inner, height: itemHeight, alignment: "leading" }}>
              {row.map((service) => (
                <ServiceItem key={service.id} service={service} width={colWidth} height={itemHeight} />
              ))}
            </HStack>
          ))}
        </VStack>
      )}
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* 主视图                                                              */
/* ------------------------------------------------------------------ */

export function RadarView({
  snapshot,
  settings,
  family,
  size,
}: {
  snapshot: Snapshot | null
  settings: Settings
  family: string
  size: Size
}): VirtualNode {
  if (!snapshot || !snapshot.exit || !snapshot.exit.ip) {
    return (
      <VStack
        alignment="center"
        spacing={8}
        modifiers={modifiers()
          .frame({ maxWidth: "infinity", maxHeight: "infinity" })}
      >
        <Image systemName="wifi.exclamationmark" font={22} foregroundStyle={C.amber} />
        <Text font={11} foregroundStyle={C.sub}>
          还没有诊断数据
        </Text>
        <Text font={9} foregroundStyle={C.dim}>
          点开脚本运行一次即可
        </Text>
      </VStack>
    )
  }

  if (family === "systemSmall" || family === "accessoryRectangular" || family === "accessoryCircular") {
    return <SmallCard snapshot={snapshot} settings={settings} size={size} />
  }

  if (family === "systemMedium") {
    return <MediumCard snapshot={snapshot} settings={settings} size={size} />
  }

  return <LargeCard snapshot={snapshot} settings={settings} size={size} />
}

function LargeCard({ snapshot, settings, size }: { snapshot: Snapshot; settings: Settings; size: Size }): VirtualNode {
  const FRAME = 8          // 外框留白：露出的小组件底色就是窗口的「墙」
  const WIN_R = 16         // 外窗圆角（外层 ~24 − 外框 8，同心收敛）
  const PAD = 12           // 窗口内左右留白
  const gap = 7
  const winW = size.width - FRAME * 2
  const winH = size.height - FRAME * 2
  const cw = winW - PAD * 2
  const halfWidth = (cw - gap) / 2
  const inner = halfWidth - 16

  const exit = snapshot.exit
  const local = snapshot.local
  const masked = settings.maskIP || snapshot.masked === true
  const ipText = masked ? maskIP(exit.ip) : exit.ip
  const modeLabel = snapshot.surge?.mode || "默认规则"

  const carrierText = /^[\w.-]+\.[a-z]{2,}$/i.test(local.carrier) ? "" : local.carrier
  const localName = carrierText || (local.net === "WiFi" ? "WiFi" : local.net)
  const connected = local.net !== "未知网络"

  const miniWidth = (inner - 6) / 2
  const ring = Math.max(0, Math.min(100, exit.purity))

  return (
    <VStack
      alignment="leading"
      spacing={0}
      modifiers={modifiers()
        .padding(FRAME)
        .frame({ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" })}
    >
      <VStack
        alignment="leading"
        spacing={0}
        frame={{ width: winW, height: winH, alignment: "topLeading" }}
      >
      {/* 顶栏 */}
      <VStack alignment="leading" spacing={0} padding={{ horizontal: PAD, vertical: 9 }} frame={{ maxWidth: "infinity" }}>
        <HStack spacing={6} frame={{ width: cw, height: 32 }}>
          <IconBox symbol="waveform.path.ecg" color={C.blue} size={28} radius={8} bg={C.blueTint} />
          <VStack alignment="leading" spacing={1.5}>
            <HStack spacing={4}>
              <Text font={12} fontWeight="bold" foregroundStyle={C.text} lineLimit={1}>
                网络诊断雷达
              </Text>
              <Tag text="PRO" color={C.blue} bg={C.blueTint} />
            </HStack>
            <Text font={6.6} foregroundStyle={C.dim} lineLimit={1}>
              {"Stash · 网页可达性，非解锁检测"}
            </Text>
          </VStack>

          <Spacer />

          {/* 状态簇：策略 | 时间，靠右成组，和左侧标题构成「窗口标题栏」 */}
          <HStack spacing={7}>
            <HStack spacing={3}>
              <Image systemName="scope" font={9} foregroundStyle={C.dim} />
              <VStack alignment="leading" spacing={1}>
                <Text font={6} foregroundStyle={C.dim} lineLimit={1}>
                  当前策略
                </Text>
                <Text font={7.6} fontWeight="semibold" foregroundStyle={C.text} lineLimit={1} minScaleFactor={0.7}>
                  {modeLabel}
                </Text>
              </VStack>
            </HStack>

            <Rectangle frame={{ width: 0.5, height: 22 }} foregroundStyle={C.line} />

            <VStack alignment="trailing" spacing={1}>
              <Text font={11.5} fontWeight="bold" fontDesign="monospaced" foregroundStyle={C.text} lineLimit={1}>
                {clockLabel(snapshot.ts)}
              </Text>
              <Text font={6.2} foregroundStyle={C.dim} lineLimit={1}>
                {dateLabel(snapshot.ts)}
              </Text>
            </VStack>
          </HStack>
        </HStack>
      </VStack>

      <Rectangle frame={{ maxWidth: "infinity", height: 0.5 }} foregroundStyle={C.line} />

      {/* 本地网络 + 当前出口节点 */}
      <VStack alignment="leading" spacing={gap} padding={{ horizontal: PAD, vertical: 10 }} frame={{ maxWidth: "infinity" }}>
        <HStack spacing={gap} frame={{ width: cw, height: 98, alignment: "topLeading" }}>
          <Card width={halfWidth} height={98} spacing={5} pad={8}>
            <HStack spacing={3} frame={{ width: inner, height: 12 }}>
              <Image systemName="wifi" font={8} foregroundStyle={C.blue} />
              <Text font={8.4} fontWeight="semibold" foregroundStyle={C.text} lineLimit={1}>
                本地网络
              </Text>
              <Spacer />
              <Tag text={connected ? "已连接" : "离线"} color={connected ? C.green : C.red} bg={connected ? C.greenTint : C.redTint} />
            </HStack>

            <HStack spacing={6} frame={{ width: inner, height: 28, alignment: "leading" }}>
              <IconBox
                symbol={local.net === "WiFi" ? "wifi" : "antenna.radiowaves.left.and.right"}
                color={C.blue}
                size={26}
                radius={8}
                bg={C.blueTint}
              />
              <VStack alignment="leading" spacing={1.5} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                <Text font={8.6} fontWeight="semibold" foregroundStyle={C.text} lineLimit={1} minScaleFactor={0.7}>
                  {localName}
                </Text>
                <HStack spacing={2}>
                  <CountryFlag value={localFlagCode(local.area, local.net)} size={7} />
                  <Text font={6.4} foregroundStyle={C.sub} lineLimit={1} minScaleFactor={0.7}>
                    {shortArea(local.area)}
                  </Text>
                </HStack>
              </VStack>
            </HStack>

            <HStack spacing={6} frame={{ width: inner, height: 13 }}>
              <Mini label="网关" value={local.gw || "—"} width={miniWidth} color={local.gw ? C.text : C.dim} />
              <Mini label="直连延迟" value={snapshot.lat.local ? `${snapshot.lat.local}ms` : "超时"} width={miniWidth} color={latencyColor(snapshot.lat.local)} />
            </HStack>
            <HStack spacing={6} frame={{ width: inner, height: 13 }}>
              <Mini
                label="IPv4 / IPv6"
                value={`✓ / ${local.v6 ? "✓" : "✕"}`}
                width={miniWidth}
                color={local.v6 ? C.green : C.sub}
              />
              <Mini label="DNS" value={local.dns || "系统"} width={miniWidth} />
            </HStack>
          </Card>

          <Card width={halfWidth} height={98} spacing={5} pad={8}>
            <HStack spacing={3} frame={{ width: inner, height: 12 }}>
              <Image systemName="point.3.connected.trianglepath.dotted" font={8} foregroundStyle={C.purple} />
              <Text font={8.4} fontWeight="semibold" foregroundStyle={C.text} lineLimit={1}>
                当前出口节点
              </Text>
              <Spacer />
              <Tag
                text={snapshot.surge?.source === "connections" ? "实测" : snapshot.surge?.node ? "链路" : "无出口"}
                color={snapshot.surge?.node ? C.green : C.red}
                bg={snapshot.surge?.node ? C.greenTint : C.redTint}
              />
            </HStack>

            <HStack spacing={5} frame={{ width: inner, height: 30, alignment: "leading" }}>
              <SurgeBadge size={26} />
              <VStack alignment="leading" spacing={1} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                <HStack spacing={2}>
                  <CountryFlag value={exit.cc || exit.country} size={7} />
                  <Text font={8.4} fontWeight="semibold" foregroundStyle={C.text} lineLimit={1} minScaleFactor={0.6}>
                    {prettyName(snapshot.surge?.node || "") || "未读取"}
                  </Text>
                </HStack>
                <Text font={6.4} foregroundStyle={C.sub} lineLimit={1} minScaleFactor={0.7}>
                  {snapshot.surge?.policy ? shortNode(snapshot.surge.policy) : shortIsp(exit.isp)}
                </Text>
              </VStack>

              <ZStack frame={{ width: 30, height: 30 }}>
                <Circle stroke={{ shapeStyle: C.ringTrack as any, strokeStyle: { lineWidth: 3 } }} frame={{ width: 30, height: 30 }} />
                <Circle
                  trim={{ from: 0, to: ring / 100 }}
                  stroke={{ shapeStyle: purityColor(ring), strokeStyle: { lineWidth: 3 } }}
                  frame={{ width: 30, height: 30 }}
                  rotationEffect={-90}
                />
                <VStack alignment="center" spacing={0}>
                  <Text font={8.6} fontWeight="bold" foregroundStyle={purityColor(ring)}>
                    {String(ring)}
                  </Text>
                  <Text font={4.6} foregroundStyle={C.dim}>
                    纯净
                  </Text>
                </VStack>
              </ZStack>
            </HStack>

            <HStack spacing={6} frame={{ width: inner, height: 13 }}>
              <Mini label="延迟" value={snapshot.lat.proxy ? `${snapshot.lat.proxy}ms` : "超时"} width={miniWidth} color={latencyColor(snapshot.lat.proxy)} />
              <Mini label="NAT" value={local.nat || "未知"} width={miniWidth} color={local.nat === "Open" ? C.green : C.dim} />
            </HStack>
            <HStack spacing={6} frame={{ width: inner, height: 13 }}>
              <Mini
                label="UDP / QUIC"
                value="未知 / 未知"
                width={miniWidth}
                color={C.dim}
              />
              <Mini label="协议" value={shortProtocol(snapshot.surge?.protocol || "")} width={miniWidth} color={snapshot.surge?.protocol ? C.teal : C.dim} />
            </HStack>
          </Card>
        </HStack>

      {/* 服务网格 */}
        <HStack spacing={gap} frame={{ width: cw, height: 110, alignment: "topLeading" }}>
          <ServiceCard title="流媒体可达" symbol="play.tv.fill" color={C.blue} items={snapshot.media} width={halfWidth} height={110} />
          <ServiceCard title="AI 网页可达" symbol="sparkles" color={C.purple} items={snapshot.ai} width={halfWidth} height={110} />
        </HStack>
      </VStack>

      <Spacer />

      <Rectangle frame={{ maxWidth: "infinity", height: 0.5 }} foregroundStyle={C.line} />

      {/* 底部指标 */}
      <HStack
        spacing={4}
        frame={{ width: winW, height: 26, alignment: "leading" }}
        padding={{ horizontal: PAD, vertical: 7 }}
      >
          <FooterCell symbol="server.rack" color={C.blue} label="ISP / 厂商" value={shortIsp(exit.isp || exit.org)} width={(cw - 12) / 4} />
          <FooterCell symbol="building.2.fill" color={C.amber} label="属性类型" value={exit.kind || "未知"} width={(cw - 12) / 4} />
          <FooterCell symbol="checkmark.shield.fill" color={purityColor(ring)} label="纯净评分" value={`${ring} 分`} width={(cw - 12) / 4} />
          <FooterCell symbol="exclamationmark.shield.fill" color={riskColor(exit.risk)} label="风险等级" value={exit.risk || "未知"} width={(cw - 12) / 4} />
      </HStack>
      </VStack>
    </VStack>
  )
}

function MediumCard({ snapshot, settings, size }: { snapshot: Snapshot; settings: Settings; size: Size }): VirtualNode {
  const pad = 13
  const cw = size.width - pad * 2
  const exit = snapshot.exit
  const local = snapshot.local
  const masked = settings.maskIP || snapshot.masked === true
  const ipText = masked ? maskIP(exit.ip) : exit.ip
  const metricWidth = (cw - 12) / 3

  return (
    <VStack
      alignment="leading"
      spacing={0}
      modifiers={modifiers()
        .padding({ horizontal: pad, vertical: 11 })
        .frame({ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" })}
    >
      <HStack spacing={5} frame={{ width: cw, height: 20 }}>
        <IconBox symbol="waveform.path.ecg" color={C.blue} size={18} radius={6} bg={C.blueTint} />
        <Text font={11.5} fontWeight="bold" foregroundStyle={C.text}>
          网络诊断雷达
        </Text>
        <Tag text={snapshot.surge?.mode || "默认规则"} color={C.sub} />
        <Spacer />
        <Text font={8} foregroundStyle={C.dim}>
          {clockLabel(snapshot.ts)}
        </Text>
      </HStack>

      <Spacer />

      <HStack spacing={5} frame={{ width: cw, height: 22 }}>
        <CountryFlag value={exit.cc || exit.country} size={14} />
        <Text font={10.5} fontWeight="semibold" foregroundStyle={C.text} lineLimit={1}>
          {[exit.country || exit.region, exit.city].filter(Boolean).join(" · ") || "未知地区"}
        </Text>
        <Spacer />
        <Tag text={exit.risk} color={riskColor(exit.risk)} bg={C.subtleSurface} />
        <Text font={12} fontWeight="bold" foregroundStyle={purityColor(exit.purity)}>
          {String(exit.purity)}
        </Text>
      </HStack>

      <HStack spacing={5} frame={{ width: cw, height: 18 }}>
        <Text font={12} fontWeight="bold" fontDesign="monospaced" foregroundStyle={C.text} lineLimit={1} minScaleFactor={0.6}>
          {ipText || "出口未识别"}
        </Text>
        <Spacer />
        <Text font={7.5} foregroundStyle={C.dim} lineLimit={1}>
          {local.net} · {shortArea(local.area)}
        </Text>
      </HStack>

      <Spacer />

      <HStack spacing={6} frame={{ width: cw, height: 34 }}>
        <VStack
          alignment="leading"
          spacing={1}
          padding={{ horizontal: 7, vertical: 5 }}
          frame={{ width: metricWidth, height: 34, alignment: "leading" }}
          widgetBackground={{ style: C.card, shape: { type: "rect", cornerRadius: 9 } }}
        >
          <Text font={6.4} foregroundStyle={C.dim}>
            代理延迟
          </Text>
          <Text font={11.5} fontWeight="bold" foregroundStyle={latencyColor(snapshot.lat.proxy)} lineLimit={1} minScaleFactor={0.7}>
            {snapshot.lat.proxy ? `${snapshot.lat.proxy}ms` : "超时"}
          </Text>
        </VStack>
        <VStack
          alignment="leading"
          spacing={1}
          padding={{ horizontal: 7, vertical: 5 }}
          frame={{ width: metricWidth, height: 34, alignment: "leading" }}
          widgetBackground={{ style: C.card, shape: { type: "rect", cornerRadius: 9 } }}
        >
          <Text font={6.4} foregroundStyle={C.dim}>
            直连延迟
          </Text>
          <Text font={11.5} fontWeight="bold" foregroundStyle={latencyColor(snapshot.lat.local)} lineLimit={1} minScaleFactor={0.7}>
            {snapshot.lat.local ? `${snapshot.lat.local}ms` : "超时"}
          </Text>
        </VStack>
        <VStack
          alignment="leading"
          spacing={1}
          padding={{ horizontal: 7, vertical: 5 }}
          frame={{ width: metricWidth, height: 34, alignment: "leading" }}
          widgetBackground={{ style: C.card, shape: { type: "rect", cornerRadius: 9 } }}
        >
          <Text font={6.4} foregroundStyle={C.dim}>
            QUIC
          </Text>
          <Text font={11.5} fontWeight="bold" foregroundStyle={C.dim} lineLimit={1}>
            {"未知"}
          </Text>
        </VStack>
      </HStack>

      <Spacer />

      <HStack spacing={4} frame={{ width: cw, height: 12 }}>
        <Text font={7.5} foregroundStyle={C.sub} lineLimit={1}>
          {shortIsp(exit.isp)}
        </Text>
        <Spacer />
        <Text font={7.5} foregroundStyle={C.dim}>
          媒体 {snapshot.media.filter((item) => item.ok).length}/{snapshot.media.length}
        </Text>
        <Text font={7.5} foregroundStyle={C.dim}>
          AI {snapshot.ai.filter((item) => item.ok).length}/{snapshot.ai.length}
        </Text>
      </HStack>
    </VStack>
  )
}

function SmallCard({ snapshot, settings, size }: { snapshot: Snapshot; settings: Settings; size: Size }): VirtualNode {
  const exit = snapshot.exit
  const masked = settings.maskIP || snapshot.masked === true
  const ipText = masked ? maskIP(exit.ip) : exit.ip
  const mediaOk = snapshot.media.filter((item) => item.ok).length
  const aiOk = snapshot.ai.filter((item) => item.ok).length

  return (
    <VStack
      alignment="leading"
      spacing={0}
      modifiers={modifiers()
        .padding({ horizontal: 12, vertical: 11 })
        .frame({ maxWidth: "infinity", maxHeight: "infinity", alignment: "topLeading" })}
    >
      <VStack alignment="leading" spacing={6} frame={{ maxWidth: "infinity", alignment: "leading" }}>
        <HStack spacing={4} frame={{ maxWidth: "infinity", height: 14 }}>
          <IconBox symbol="waveform.path.ecg" color={C.blue} size={14} radius={4} bg={C.blueTint} />
          <Text font={9.5} fontWeight="bold" foregroundStyle={C.text} lineLimit={1}>
            网络雷达
          </Text>
          <Spacer />
          <Text font={7} foregroundStyle={C.dim} lineLimit={1}>
            {agoLabel(snapshot.ts)}
          </Text>
        </HStack>

        <HStack spacing={4} frame={{ maxWidth: "infinity", height: 20 }}>
          <CountryFlag value={exit.cc || exit.country} size={13} />
          <Text font={15} fontWeight="bold" foregroundStyle={purityColor(exit.purity)}>
            {String(exit.purity)}
          </Text>
          <Spacer />
          <Tag text={exit.risk} color={riskColor(exit.risk)} bg={C.subtleSurface} />
        </HStack>

        <Text
          font={9.5}
          fontWeight="semibold"
          fontDesign="monospaced"
          foregroundStyle={C.text}
          lineLimit={1}
          minScaleFactor={0.5}
          frame={{ maxWidth: "infinity", alignment: "leading" }}
        >
          {ipText || "未识别"}
        </Text>
      </VStack>

      <Spacer />

      <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity", alignment: "leading" }}>
        <HStack spacing={4} frame={{ maxWidth: "infinity", height: 13 }}>
          <Text font={9} fontWeight="medium" foregroundStyle={latencyColor(snapshot.lat.proxy)} lineLimit={1} minScaleFactor={0.6}>
            代理 {snapshot.lat.proxy || "—"}ms
          </Text>
          <Spacer />
          <Text font={9} fontWeight="medium" foregroundStyle={latencyColor(snapshot.lat.local)} lineLimit={1} minScaleFactor={0.6}>
            直连 {snapshot.lat.local || "—"}ms
          </Text>
        </HStack>

        <HStack spacing={6} frame={{ maxWidth: "infinity", height: 13 }}>
          <Text font={8} foregroundStyle={C.dim} lineLimit={1}>
            媒体 {mediaOk}/{snapshot.media.length}
          </Text>
          <Text font={8} foregroundStyle={C.dim} lineLimit={1}>
            AI {aiOk}/{snapshot.ai.length}
          </Text>
          <Spacer />
          <Text font={8} foregroundStyle={C.dim} lineLimit={1}>
            QUIC 未知
          </Text>
        </HStack>
      </VStack>
    </VStack>
  )
}
