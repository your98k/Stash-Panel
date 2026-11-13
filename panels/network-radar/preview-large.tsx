// 大号小组件预览专用入口（临时文件，用于边角优化对比）
// 用一份合成快照直接渲染 LargeCard，绕过 diagnose / Surge 网络逻辑。
import { VStack } from "scripting"
import { RadarView } from "./src/ui"
import type { Snapshot } from "./src/types"
import type { Settings } from "./src/store"

const settings: Settings = {
  refreshMinutes: 15,
  maskIP: false,
  apiEnabled: false,
  surgeKey: "",
  surgeHost: "127.0.0.1",
  surgePort: 9090,
  policyGroup: "",
}

const snapshot: Snapshot = {
  v: 1,
  ts: Date.now(),
  src: "self",
  masked: false,
  exit: {
    ip: "104.21.16.12",
    cc: "US",
    country: "美国",
    region: "California",
    city: "Mountain View",
    isp: "Google LLC",
    asn: "AS15169",
    org: "Google",
    proxy: true,
    hosting: true,
    mobile: false,
    kind: "云服务器",
    purity: 84,
    risk: "低风险",
  },
  local: {
    net: "WiFi",
    ip: "192.168.1.15",
    gw: "192.168.1.1",
    dns: "1.1.1.1",
    area: "中国 浙江 杭州",
    carrier: "",
    nat: "Open",
    vpn: false,
    v6: true,
  },
  lat: { proxy: 37, local: 9 },
  quic: { ok: true, reachable: true },
  media: [
    { id: "netflix", name: "Netflix", ok: true, cc: "JP", policy: "Media" },
    { id: "disney", name: "Disney+", ok: true, cc: "US", policy: "Media" },
    { id: "spotify", name: "Spotify", ok: false, cc: "直连", policy: "Direct" },
    { id: "tiktok", name: "TikTok", ok: true, cc: "KR", policy: "Media" },
    { id: "youtube", name: "YouTube", ok: true, cc: "US", policy: "Media" },
    { id: "prime", name: "Prime", ok: false, cc: "拦截", policy: "REJECT" },
  ],
  ai: [
    { id: "chatgpt", name: "ChatGPT", ok: true, cc: "US", policy: "AI" },
    { id: "claude", name: "Claude", ok: true, cc: "FR", policy: "AI" },
    { id: "gemini", name: "Gemini", ok: true, cc: "US", policy: "AI" },
    { id: "deepseek", name: "DeepSeek", ok: true, cc: "CN", policy: "AI" },
    { id: "grok", name: "Grok", ok: false, cc: "US", policy: "AI" },
    { id: "perplexity", name: "Perplexity", ok: true, cc: "US", policy: "AI" },
  ],
  surge: { mode: "全局代理", policy: "Media", protocol: "Trojan", node: "Tokyo-01" },
}

export default function LargePreview() {
  return (
    <VStack
      alignment="leading"
      frame={{ width: 338, height: 354, alignment: "topLeading" }}
      clipShape={{ type: "rect", cornerRadius: 24 }}
    >
      <RadarView
        snapshot={snapshot}
        settings={settings}
        family="systemLarge"
        size={{ width: 338, height: 354 }}
      />
    </VStack>
  )
}
