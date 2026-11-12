# Stash-Panel

自用及原创的 **Stash 面板与小组件合集**（基于 Scripting / Stash HTTP Control API），持续收录后续制作的各类 Stash 桌面面板、锁屏小组件与控制工具。

---

## 收录面板

| 面板 | 版本 | 说明 | 预览与文档 | 安装包（Raw） | 安装包（CDN） |
| :--- | :---: | :--- | :---: | :---: | :---: |
| **Stash 面板（Stash Panel）** | `v1.1.5` | 全功能桌面与锁屏小组件面板：25 种布局、一键切模式、策略组选节点、实时流量、节点延迟历史、多机场用量预测与控制中心开关 | [详情与预览](panels/stash-panel/README.md) | [下载](https://github.com/your98k/Stash-Panel/raw/main/panels/stash-panel/dist/Stash_Panel.scripting) | [下载](https://cdn.jsdelivr.net/gh/your98k/Stash-Panel@main/panels/stash-panel/dist/Stash_Panel.scripting) |

> 后续新制作的 Stash 面板将按独立目录继续收录在 `panels/` 下，并在本表同步更新。

---

## 仓库结构

```text
Stash-Panel/
├── README.md                     # 仓库总览与全部面板索引
└── panels/                       # 各个 Stash 面板独立项目目录
    └── stash-panel/              # Stash 面板（Stash Panel v1.1.5）
        ├── README.md             # 面板功能介绍、预览图与安装说明
        ├── assets/               # 图标与效果图
        ├── dist/                 # 可直接导入 Scripting 的 .scripting 安装包
        ├── src/                  # TypeScript / TSX 源码
        ├── tests/                # 离线回归检查脚本
        └── package.json
```

---

## 通用使用前提

1. **安装运行环境**：在 iPhone / iPad 上安装 **[Scripting](https://scripting.fun)** 与 **Stash**。
2. **开启 Stash 外部控制**：打开 **Stash** →「设置」→「外部控制（External Access）」，开启服务（默认端口 `9090`，按需设置 Secret 密钥）。
3. **导入面板**：在上方表格中任选面板下载 `.scripting` 安装包，选择「用 **Scripting** 打开」即可导入。
4. **详细参数与样式**：每个面板的桌面参数、样式预览及更新记录，请进入对应面板目录的 `README.md` 查看。

---

## 说明

- 原生适配 **Stash HTTP Control API**，不修改现有 Stash 分流规则与配置。
- 本仓库所有面板仅供个人学习、研究与自用。
