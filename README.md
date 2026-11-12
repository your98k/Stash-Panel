<div align="center">

<img src="assets/icon.png" width="96" height="96" alt="Stash Panel Icon" />

# Stash Panel

**基于 Scripting 的 Stash 桌面与锁屏小组件面板**

直连本机 Stash 外部控制接口，开箱即用，支持**一键切换模式、桌面策略组选节点、实时累计流量、节点延迟历史与多机场用量预测**。

[![Version](https://img.shields.io/badge/Version-v1.1.4-0A84FF?style=flat-square)](https://github.com/your98k/Stash-Panel)
[![Platform](https://img.shields.io/badge/iOS-Scripting-34C759?style=flat-square)](https://scripting.fun)
[![Stash](https://img.shields.io/badge/Stash-HTTP_Control_API-5856D6?style=flat-square)](https://stash.wiki)

---

### 功能全景预览

![Stash Panel Banner](assets/preview-banner.png)

### 经典中号面板（默认样式）

![经典中号面板效果预览](assets/preview-classic.png)

</div>

---

## 核心特性

- **开箱即用**：直接调用 Stash 原生外部控制 HTTP API（默认 `http://127.0.0.1:9090`），无需改动现有配置与分流规则。
- **即点即切交互**：
  - 小组件上直接点按模式胶囊，一键循环切换 **直连 / 分流 / 全局** 模式；
  - 桌面直接点进常用策略组卡片选择节点，支持多层嵌套策略组联动切换。
- **节点延迟与可用率**：
  - 读取 Stash `/stash/proxy/display/v2` 与 `/proxies` 原生历史延迟；
  - 每次测速自动本地沉淀最近 24 次记录，生成延迟折线图（Sparkline）和可用率格子。
- **实时与累计流量**：接入 `/stash/speed`，精确展示本次 Stash 启动累计下行 / 上行流量与实时速率。
- **多机场订阅管理与预测**：
  - 支持直接粘贴 **Stash / Clash YAML**（自动解析 `proxy-providers:` 中的订阅链接）、纯链接或手填用量；
  - 自动读取 `Subscription-Userinfo`，统计**今日用量、日均额度、剩余天数、用完预测、14 天柱状趋势、热力月报、每 GB 性价比**；
  - 支持超额 / 临期本地通知提醒。
- **25 种桌面与锁屏样式 + 控制中心开关**：
  - 涵盖**小号、中号、大号、锁屏圆形 / 长条 / 单行**；
  - 配套 iOS 控制中心 **「Stash 模式开关」** 与 **「Stash 切到最快」** 按钮；
  - 支持素净模式（跟随系统深浅色）或自定义纯色 / 相册模糊背景。
- **安全与隐私**：API 密钥（Secret）与机场订阅链接均保存在系统 **Keychain（钥匙串）** 中，不写入明文配置。

---

## 快速安装与使用

### 1. 下载与导入 Scripting

1. 确保 iPhone / iPad 已安装 **[Scripting](https://scripting.fun)** App（以及 **Stash**）。
2. 下载安装包：
   - 直接下载：**[Stash_Panel.scripting](https://github.com/your98k/Stash-Panel/raw/main/dist/Stash_Panel.scripting)**（或使用 [jsDelivr CDN](https://cdn.jsdelivr.net/gh/your98k/Stash-Panel@main/dist/Stash_Panel.scripting)）
3. 下载后选择「用 **Scripting** 打开」即可完成导入。

### 2. 开启 Stash 外部控制并连接

1. 打开 **Stash** →「设置」→「外部控制（External Access）」，开启服务（默认端口 `9090`，可按需设置密钥 Secret）。
2. 在 **Scripting** 中运行「**Stash 面板**」。
3. 进入面板「设置」→「Stash 连接」，核对地址（默认 `http://127.0.0.1:9090`）并填写外部控制密钥，点击「测试并保存」。

### 3. 添加桌面小组件

长按 iOS 主屏幕空白处 → 左上角「＋」→ 搜索 **Scripting** → 选择所需尺寸的小组件 → 编辑小组件，脚本选择 **Stash 面板**：

- 若需使用首推的**经典中号布局**（默认即为此样式），参数留空或填写：`中·经典面板`
- 若需使用其他样式，可在 App 内「样式库」预览并一键复制对应的桌面参数，例如：
  - `小·网络总览`、`小·流量总览`、`小·用量环`、`小·当前节点`、`小·模式开关`
  - `中·经典面板`、`中·网络总览`、`中·流量总览`、`中·策略组卡片`、`中·控制台`、`中·用量趋势`
  - `大·全景看板`、`大·用量月报`、`大·节点全景`、`大·策略组卡片`
  - `锁屏圆·锁屏`、`锁屏条·锁屏`、`锁屏行·锁屏`

---

## 样式一览（25 种）

| 尺寸 | 包含样式 |
| :--- | :--- |
| **小号** (`systemSmall`) | 经典统计(网络总览 / 流量总览)、用量环、当前节点、今日流量、每日额度、多机场、倒计时、模式开关、环比 |
| **中号** (`systemMedium`) | **经典面板（默认）**、网络总览、流量总览、用量趋势、节点体检、多机场、今日时段、延迟排行、控制台、策略组卡片、事件时间线、性价比 |
| **大号** (`systemLarge`) | 全景看板、用量月报、节点全景、策略组卡片 |
| **锁屏** (`accessory*`) | 锁屏（圆/条/行）、延迟（圆）、今日用量（圆） |

> 注：以上预览图中的数字与界面为示意图，实际小组件渲染效果以你的 iOS 系统字体、小组件尺寸及配置数据为准。

---

## 目录结构

```text
Stash-Panel/
├── assets/
│   ├── icon.png              # 面板图标
│   ├── preview-banner.png    # 功能全景宣传图
│   └── preview-classic.png   # 经典中号面板预览图
├── dist/
│   ├── Stash_Panel.scripting        # 最新版安装包（直接导入 Scripting）
│   └── Stash_Panel_1.1.4.scripting  # v1.1.4 归档包
└── src/                      # 完整 Scripting TypeScript / TSX 源码
    ├── script.json
    ├── index.tsx             # App 主界面与管理控制台
    ├── widget.tsx            # 桌面 / 锁屏小组件入口
    ├── app_intents.tsx       # 交互意图（切换模式 / 选节点 / 刷新）
    ├── api.ts              # Stash HTTP Control API 接口层
    ├── subs.ts               # 订阅拉取、YAML 解析与用量预测引擎
    ├── settings.ts           # Keychain 与持久化配置
    ├── ui.tsx / kit.tsx      # 基础 UI 组件与主题引擎
    └── styles/               # 25 种小组件布局实现
```

---

## 说明

- 原生适配 **Stash HTTP Control API**，专为 Stash 用户设计。
- 仅供个人学习与自用。
