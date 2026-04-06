<div align="center">

<img src="./assets/NASGElogo.jpg" alt="NASGE" width="200">

# NASGE — Not A Steam Guide Editor

**指南创作者友好的 Steam 社区指南所见即所得编辑器浏览器扩展**

[![Version](https://img.shields.io/badge/version-0.9.7-blue.svg)](https://github.com/JohnS3248/NASGE/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

<!-- [![Chrome Web Store](https://img.shields.io/chrome-web-store/v/EXTENSION_ID?label=Chrome%20Web%20Store&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/EXTENSION_ID) -->

**简体中文 | [English](README_en.md)**

</div>

---

<!-- TODO: GIF 准备好后替换占位图 -->

<div align="center">

### 所见即所得编辑器

无需手搓 BBCode，样式像素级复刻 Steam 官方指南

![所见即所得编辑器](assets/highlights/h1-wysiwyg.gif)

### 格式灵活

选中 + 右键 = 更改格式，黑条/加粗/下划线/标题等高频功能一键实现

![格式灵活](assets/highlights/h2-formatting.gif)

### 设置齐全

深度自定义设置，包括自定义快捷键，随心所欲调整右键菜单位置

![设置齐全](assets/highlights/h3-settings.gif)

### 图片一键上传

自研上传队列算法，支持粘贴改名，双击自动上传

![图片一键上传](assets/highlights/h4-image-upload.gif)

### 实时预览

自研实时预览算法，上传前双保险，直接显示预览效果

![实时预览](assets/highlights/h5-live-preview.gif)

### 章节管理

拉取对应章节，草稿持久化保存，刷新不丢，不破坏原有指南

![章节管理](assets/highlights/h6-chapter.gif)

### 离线草稿管理

多指南编辑友好，会话隔离，离线模式可以访问存档

![离线草稿管理](assets/highlights/h7-offline.gif)

### 评测模式

同样支持评测，写新评测/改评测，持久化草稿，离线功能

![评测模式](assets/highlights/h8-review.gif)

</div>

---

<details>
<summary><strong>目录</strong></summary>

- [为什么需要 NASGE？](#为什么需要-nasge)
- [功能特性](#功能特性)
- [安装](#安装)
- [使用方法](#使用方法)
- [技术栈](#技术栈)
- [开发](#开发)
- [贡献](#贡献)
- [路线图](#路线图)
- [许可证](#许可证)

</details>

## 为什么需要 NASGE？

Steam 自带的指南编辑器是一个纯文本 BBCode 编辑器——没有预览、没有图片管理、没有草稿系统。为了写一篇排版精良的指南意味着将不断在编辑和预览之间切换，并且要忍受手动输入 复杂BBCode 标签表达格式，图片只能手动上传，还要担心没有自动保存导致内容丢失。

**NASGE 彻底改变了bbcode编辑形态**：在独立标签页中打开完整的所见即所得编辑器，你用“所见即所得”的富文本写作，NASGE 在后台处理 BBCode 转换和 Steam 同步，并且可以通过NASGE提交和上传到steam对应章节。

## 功能特性

- **所见即所得编辑** — 基于 TipTap 的富文本编辑器。加粗、斜体、标题、列表、链接、表格、剧透标签（黑条）、引用块——全部可视化渲染，对齐官方指南样式
- **章节管理** — 侧边栏查看所有章节，拖拽排序，一键从 Steam 拉取/推送，不破坏原有指南章节
- **图片池** — 浮动面板浏览指南已上传的图片。搜索、标签筛选、粘贴改名，一键插入。拖入图片池右键可改格式
- **评测模式** — 用同样的所见即所得体验撰写和发布 Steam 游戏评测。推荐/不推荐、可见性、语言设置一面板搞定
- **多主题** — 三套内置主题：steam-dark、midnight、classic，跨会话保持偏好
- **草稿与存档** — 多指南评测编辑友好，自动保存的本地草稿 + 手动存档快照，再也不会丢失内容
- **离线模式** — 无需 Steam 连接即可创建和编辑草稿，准备好了再同步
- **多语言** — i18n多语言支持，首发支持中英双语，自动检测浏览器语言
- **BBCode 往返保真** — `BBCode → HTML → BBCode` 产生语义等价的输出，格式完整保留而非被"规范化"

## 安装

### Chrome Web Store（推荐）

<!-- TODO: Chrome Web Store 上架后替换链接 -->

> 即将发布——扩展正在准备首次公开发布。

### 手动安装（开发者）

1. 克隆仓库
   ```bash
   git clone https://github.com/JohnS3248/NASGE.git
   cd NASGE
   npm install
   ```
2. 构建扩展
   ```bash
   npm run build
   ```
3. 在 Chrome 中加载
   - 打开 `chrome://extensions`
   - 启用右上角的 **开发者模式**
   - 点击 **加载已解压的扩展程序** → 选择 `dist/` 文件夹

## 使用方法

1. 访问任意 Steam 指南编辑页面（`steamcommunity.com/sharedfiles/manageguide/...`）
2. 点击 NASGE 扩展图标 → **编辑指南**
3. 新标签页中打开所见即所得编辑器
4. 编辑指南 → 点击 **推送** 将章节同步回 Steam

**评测模式**：访问任意 Steam 商店页面，点击扩展图标 → **编辑评测**，即可编辑现有评测或撰写新评测。

**离线模式**：点击扩展图标 → **离线指南** 或 **离线评测**，无需打开 Steam 页面即可编辑草稿，准备好后再同步。

## 技术栈

| 类别         | 技术                        |
| ------------ | --------------------------- |
| UI 框架      | React 19                    |
| 富文本编辑器 | TipTap 3 (ProseMirror)      |
| 状态管理     | Zustand 5                   |
| 样式         | Tailwind CSS 4              |
| 语言         | TypeScript 5（严格模式）    |
| 构建         | Vite 7 + @crxjs/vite-plugin |
| 国际化       | i18next + react-i18next     |
| 扩展规范     | Chrome Manifest V3          |

## 开发

```bash
# 安装依赖
npm install

# 开发服务器（仅用于编辑器 UI 迭代，不是可加载的扩展）
npm run dev

# 监听模式（将 dist/ 作为未打包扩展加载进行真实测试）
npm run dev:extension

# 类型检查
npm run type-check

# 运行测试
npm run test

# 生产构建
npm run build
```

### 架构

```
src/
├── editor/          # 主编辑器应用（在独立标签页中打开）
│   ├── components/  # React 组件
│   ├── extensions/  # 自定义 TipTap 扩展（steamImage、spoiler 等）
│   ├── stores/      # Zustand 状态管理
│   ├── services/    # Steam API 桥接、图片上传、章节同步
│   └── utils/       # BBCode 转换器、工具函数
├── content/         # 注入 steamcommunity.com 的内容脚本
├── background/      # Service Worker（消息中继）
├── popup/           # 扩展弹出窗口 UI
├── i18n/            # 国际化资源
└── shared/          # 共享类型、日志、消息协议
```

通信流：**编辑器标签页** ↔ `chrome.runtime` ↔ **Background SW** ↔ **内容脚本** ↔ **Steam 页面 DOM**

## 贡献

1. Fork 仓库并创建分支（`git checkout -b feat/my-feature`）
2. `npm install && npm run dev:extension`
3. 在 Chrome 中加载 `dist/` 作为未打包扩展
4. 修改 → `npm run build` → 手动验证
5. 提交 PR

欢迎在 [GitHub Issues](https://github.com/JohnS3248/NASGE/issues) 提交 Bug 报告和功能建议。

<!-- 详细指南请参阅 [CONTRIBUTING.md](CONTRIBUTING.md)。 -->

## 路线图

- [X] 所见即所得 BBCode 编辑器（往返保真）
- [X] 章节管理与 Steam 同步
- [X] 图片池与上传
- [X] 评测模式
- [X] 多主题支持（steam-dark / midnight / classic）
- [X] 草稿与存档系统
- [X] 国际化（zh-CN + en-US）
- [ ] 新用户引导教程
- [ ] Chrome Web Store 上架
- [ ] Firefox 支持
- [ ] 更多语言（欢迎贡献！）

## 许可证

MIT License — 详见 [LICENSE](LICENSE)。

---

<div align="center">

**[报告 Bug](https://github.com/JohnS3248/NASGE/issues)** · **[功能建议](https://github.com/JohnS3248/NASGE/issues)**

</div>
