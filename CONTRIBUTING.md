# 贡献指南

感谢你对 NASGE 的关注！无论是报告 Bug、提出功能建议，还是提交代码，我们都非常欢迎。

**[English version](CONTRIBUTING_en.md)**

---

## 行为准则

- 保持尊重和建设性的交流
- 欢迎不同水平的贡献者
- Issue 和 PR 讨论使用中文或英文均可

## 如何贡献

### 报告 Bug / 提交建议

在 [GitHub Issues](https://github.com/JohnS3248/NASGE/issues) 提交，请包含：

- **Bug 报告**：发生了什么 vs 预期行为、浏览器版本、扩展版本、复现步骤、截图（如涉及 UI）
- **功能建议**：描述使用场景和期望的行为

### 提交代码

1. **Fork 并克隆仓库**
   ```bash
   git clone https://github.com/<你的用户名>/NASGE.git
   cd NASGE
   ```

2. **安装依赖**（需要 Node.js，版本见 `.nvmrc`）
   ```bash
   npm install
   ```

3. **创建分支**
   ```bash
   git checkout -b feat/my-feature
   ```

4. **启动开发模式**
   ```bash
   npm run dev:extension
   ```
   在 Chrome 打开 `chrome://extensions` → 开发者模式 → 加载已解压的扩展程序 → 选择 `dist/` 文件夹。

5. **修改代码并验证**
   ```bash
   npm run type-check   # TypeScript 类型检查
   npm run test         # 单元测试
   npm run build        # 生产构建
   ```
   UI 和扩展功能需要在 Chrome 中手动验证。

6. **提交 PR** — 推送分支，向 `main` 提交 Pull Request，按 PR 模板填写。

## Commit 规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 格式：

```
type(scope): description
```

**type 列表：**

| type | 用途 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `refactor` | 重构（不改行为） |
| `test` | 测试 |
| `docs` | 文档 |
| `style` | 样式（代码格式，非 UI 样式） |
| `ci` | CI/CD |
| `chore` | 杂项 |

**常用 scope：** `editor`、`bbcode`、`content`、`background`、`popup`、`store`、`i18n`、`imagePanel`、`build`

description 使用中文或英文均可。

## PR 检查清单

提交 PR 时会自动加载 [PR 模板](.github/PULL_REQUEST_TEMPLATE.md)，请确保：

- `npm run type-check` 通过
- `npm run test` 通过
- `npm run build` 通过
- 涉及 BBCode 转换 → roundtrip 测试全绿
- 涉及用户可见文本 → 同步添加 `zh-CN` 和 `en-US` 的 i18n key
- 涉及 Chrome 权限 → 在 PR 说明中解释理由
- 涉及 UI → 附截图或录屏

## i18n 要求

所有用户可见文本必须使用 i18n key，不得硬编码中文或英文字符串。新增 key 必须同时添加到 `src/i18n/locales/zh-CN/` 和 `src/i18n/locales/en-US/` 对应的 JSON 文件中。

详见 `.claude/rules/i18n.md`。

## 测试策略

NASGE 的测试理念是**守护致命风险，而非追求覆盖率**。详见 [TESTING.md](TESTING.md)。

- 修改 BBCode 转换或 Store persist 结构 → 必须添加/更新测试
- 修改 React 组件或 TipTap 扩展 → 在 PR 中描述手动验证步骤和结果

## 许可证

提交的代码将遵循本项目的 [MIT 许可证](LICENSE)。
