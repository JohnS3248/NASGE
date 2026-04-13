# 隐私说明

本文档说明 NASGE 浏览器扩展如何处理用户数据。

**[English version](PRIVACY_en.md)**

---

## 数据收集

**NASGE 不收集任何用户数据。** 没有分析统计、没有遥测、没有追踪、没有外部服务器。

## 本地存储

NASGE 使用浏览器的 `localStorage` 和 `chrome.storage` 在本地保存以下数据：

- 指南和评测草稿
- 存档快照
- 编辑器设置（主题、布局、语言偏好等）
- 图片库标签

所有数据存储在用户本机浏览器中，不会自动上传到任何服务器。

## 权限说明

| 权限 | 用途 |
|------|------|
| `storage` | 在本地保存草稿、存档和用户设置 |
| `activeTab` | 用户点击扩展图标时与当前 Steam 页面交互 |
| `scripting` | 向 Steam 页面注入内容脚本，实现指南/评测编辑桥接 |

### 主机权限

| 域名 | 用途 |
|------|------|
| `steamcommunity.com` | 读写指南内容、上传图片、管理章节 |
| `store.steampowered.com` | 读写游戏评测 |

## 图片上传

当用户选择上传图片时，图片直接上传到 Steam 自身的上传端点（`steamcommunity.com`）。NASGE 不会代理、存储或转发图片到任何第三方服务器。

## 网络通信

NASGE 仅与上述 Steam 域名通信。不会向 NASGE 开发者或任何第三方发送任何数据。

## 第三方服务

无。NASGE 不使用任何分析服务（如 Google Analytics）、崩溃报告、CDN 或外部 API。

## 开源

NASGE 的完整源代码托管在 [GitHub](https://github.com/JohnS3248/NASGE)，任何人都可以审计代码以验证上述声明。

## 联系方式

如有隐私相关问题，请在 [GitHub Issues](https://github.com/JohnS3248/NASGE/issues) 提交。
