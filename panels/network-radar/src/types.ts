// Stash 版自测快照。surge 字段仅为内部兼容命名，不代表实测出站。

export type ServiceInfo = {
  id: string
  name: string
  ok: boolean
  /** 服务归属未知时为空，不借用 IP 查询接口的出口国家。 */
  cc: string
  status?: number
  /** 该服务在活跃连接里实测命中的出口节点；未命中时为空，由主出口回退展示。 */
  policy: string
  /** policy 的来源：活跃连接实测 / 空表示未命中。 */
  policySource?: "connections" | ""
  /** 该服务实测命中的策略组。 */
  policyGroup?: string
}

export type ExitInfo = {
  ip: string
  cc: string
  country: string
  region: string
  city: string
  isp: string
  asn: string
  org: string
  proxy: boolean
  hosting: boolean
  mobile: boolean
  kind: string
  purity: number
  risk: string
}

export type LocalInfo = {
  /** WiFi · SSID / 蜂窝 · 运营商 / 接口名 */
  net: string
  ip: string
  gw: string
  dns: string
  area: string
  carrier: string
  nat: string
  vpn: boolean
  /** 是否有内网 IPv6 */
  v6?: boolean
}

export type SurgeInfo = {
  mode: string
  policy: string
  protocol: string
  node: string
  /** connections = 活跃连接实测；policy-chain = 策略组链；direct = 全部直连 */
  source?: "connections" | "policy-chain" | "direct"
  /** 读取时 Stash 的活跃连接条数 */
  active?: number
}

export type Snapshot = {
  v: 1
  ts: number
  src: "self"
  masked?: boolean
  exit: ExitInfo
  local: LocalInfo
  lat: { proxy: number; local: number }
  quic: { ok: boolean | null; reachable: boolean }
  media: ServiceInfo[]
  ai: ServiceInfo[]
  surge?: SurgeInfo
  cost?: number
}

export const EMPTY_EXIT: ExitInfo = {
  ip: "",
  cc: "",
  country: "",
  region: "",
  city: "",
  isp: "",
  asn: "",
  org: "",
  proxy: false,
  hosting: false,
  mobile: false,
  kind: "未知网络",
  purity: 0,
  risk: "未知",
}

export const EMPTY_LOCAL: LocalInfo = {
  net: "未知网络",
  ip: "",
  gw: "",
  dns: "",
  area: "",
  carrier: "",
  nat: "",
  vpn: false,
  v6: false,
}
