# NASGE 测试覆盖审计报告

> 编写时间：2026-04-08
> 目的：**评估测试防护网是否守住致命风险**，而不是追求覆盖率数字。开源前最后一次体检。

---

## 1. 原则

NASGE 的测试不是覆盖率游戏，而是**精准守护几类不可接受的事故**：

1. **数据丢失**：草稿、存档、配置、图片池数据被意外覆盖或清空
2. **内容失真**：BBCode ↔ HTML 往返后用户内容变形
3. **Steam 侧污染**：重复上传、跨存档图片串流
4. **迁移事故**：老版本数据升级时被破坏

对这些风险之外的代码（React 组件、Chrome 扩展集成、TipTap 扩展渲染），我们**明确接受不用单元测试覆盖**，改用：
- 手动验收（browser DevTools eval / 真实扩展加载）
- TypeScript 类型检查
- 代码审查

这是一个**刻意选择的取舍**：单元测试 ROI 高的地方测到位，ROI 低的地方不测。

---

## 2. 当前测试资产

| 指标 | 数值 |
|------|------|
| 测试文件 | 10 |
| 测试用例 | 325 |
| 总行覆盖率 | 21% |
| 已测文件分支覆盖率 | 86% |

**21% 不是"只有 21% 的代码安全"**，而是：

| 区域 | 覆盖率 | 意图 |
|------|------|------|
| `editor/utils/bbcode.ts` | **97%** | 致命风险，必测 |
| `editor/utils/previewImageBBCode.ts` | **100%** | 致命风险，必测 |
| `editor/stores/useDraftStore.ts` | **100%** | 致命风险，必测 |
| `editor/stores/useArchiveStore.ts` | **100%** | 致命风险，必测 |
| `editor/stores/useGuideStore.ts` | **100%** | 致命风险，必测 |
| `editor/stores/useSteamGuideImageStore.ts` | **99%** | 致命风险，必测 |
| `editor/stores/useEditorConfigStore.ts` | **98%** | 中风险，必测 |
| `editor/services/imagePoolIntake.ts` | **99%** | 致命风险，必测 |
| `editor/services/ImageUploadService.ts` | 51% | 池队列路径完覆盖，editor 上传路径未覆盖 |
| `editor/components/**` | ~0% | **刻意不测**（UI） |
| `editor/hooks/**` | ~0% | **刻意不测**（UI 辅助） |
| `editor/extensions/**` | ~7% | **刻意不测**（依赖 TipTap runtime） |
| `content/**` / `background/**` / `popup/**` | 已排除 | **刻意不测**（Chrome 扩展集成） |

把这些"刻意不测"的代码算进分母，总覆盖率必然低。这是正常的。

---

## 3. 致命风险清单 + 防护评级

评级说明：
- 🟢 **完善**：至少 3 个相关测试，分支覆盖充分，修改时会立即红
- 🟡 **部分**：核心路径有测试，但边界或错误分支未完全覆盖
- 🔴 **缺失**：无测试防护，靠手动验收

### 3.1 数据安全类

#### R1 — 草稿丢失（误删 / 覆盖 / 保存失败）

- **影响**：用户数小时到数周的编辑成果消失
- **相关代码**：`useDraftStore.ts` + `utils/debouncedStorage.ts`
- **防护测试**：
  - `useDraftStore.test.ts` > "addDraft" × 5、"selectDraft / markDirty / markClean" × 2、"updateDraft" × 3、"deleteDraft / restoreDraft" × 5
  - `useDraftStore.test.ts` > "persist / rehydrate" × 7（含 v0→v1→v2 migrate）
  - `useDraftStore.test.ts` > "sessionStorage 同步 activeDraftId" × 2
- **评级**：🟢 完善

#### R2 — 存档（Archive）数据损坏

- **影响**：用户所有存档的章节、图片标签、封面数据丢失
- **相关代码**：`useArchiveStore.ts`
- **防护测试**：`useArchiveStore.test.ts` 43 tests，覆盖 CRUD / 标签 CRUD / 图片打标签 / 查询 / persist migrate
- **评级**：🟢 完善

#### R3 — persist 迁移 bug（老数据升级破坏）

- **影响**：升级新版本后用户老数据崩溃或丢失
- **相关代码**：所有 `persist(..., { version, migrate })` 的 store
- **防护测试**：

| Store | 当前 version | migrate 测试 | 评级 |
|-------|------------|------------|------|
| `useDraftStore` | v2 | ✅ `v0 → v1 migrate 自动补 nextDraftNumber` | 🟢 |
| `useArchiveStore` | v1 | ✅ `v0 数据缺 imageTags/imageTagMap → migrate 自动补` + `空 persisted state → migrate 返回空 archives` | 🟢 |
| `useEditorConfigStore` | 无显式 version | ✅ 6 个 merge 测试覆盖字段缺失自动补默认 | 🟢 |
| `useGuideStore` | v1 | 无显式 migrate（结构稳定） | 🟡 |
| `useSteamGuideImageStore` | v1 | 无 migrate（partialize 只存 pending） | 🟡 |
| `useImagePanelStore` | v1 | 无测试 | 🟡 |
| `useImageStore` | v1 | 无测试 | 🟡 |

- **总评级**：🟡 部分
- **风险**：核心数据 store（Draft / Archive / EditorConfig）已完善，但外围 store（SteamGuideImage / ImagePanel / Image）未来改 schema 时会有盲区
- **缓解**：在 §6 PR checklist 中强制"改 persist 结构必须 bump version + 写 migrate 测试"

#### R4 — 多窗口 activeDraftId 竞态

- **影响**：用户开多个编辑器标签，A 窗口选草稿 a，B 窗口选草稿 b，切回 A 发现变成 b
- **相关代码**：`useDraftStore.ts:265-289` onRehydrateStorage + sessionStorage
- **防护测试**：
  - `sessionStorage 同步 activeDraftId` × 2
  - `persist / rehydrate` > 3 个 rehydrate 路径（sessionStorage 有效/无效/无记录 fallback）
- **评级**：🟢 完善

### 3.2 内容失真类

#### R5 — BBCode ↔ HTML 往返不保真

- **影响**：用户编辑后保存，再打开内容变形（换行消失、格式错乱、图片对齐丢失）
- **相关代码**：`editor/utils/bbcode.ts`（550 行，项目最脆弱文件）
- **防护测试**：
  - `bbcodeRoundtrip.test.ts` 共 107 tests，覆盖纯文本/标题/格式/链接/图片/列表/表格/代码/引用/分隔线/嵌套引用/标题内换行/图片尺寸对齐
  - `bbcodeRoundtrip.test.ts` > `完整大章节 roundtrip` × 4 个真实长样本
  - `bbcodeRoundtrip.test.ts` > `Steam 兼容性回归` × 9（`[code]` 字面保留、`[url]` 无等号等真实 bug 修复回归）
  - `fixtureRoundtrip.test.ts` × 3 真实素材端到端（339 行综合 BBCode + 内联图片 + 表格）
  - 行覆盖 97% / 分支 85%
- **评级**：🟢 完善（项目中测试最密集的文件）

#### R6 — 图片标签编码/解码错误

- **影响**：`[previewimg]` 和 `[previewicon]` 被混淆，图片对齐/尺寸/文件名丢失
- **相关代码**：`editor/utils/previewImageBBCode.ts`
- **防护测试**：
  - `previewImageBBCode.test.ts` 33 tests
  - 覆盖：encode 正常/超长/Unicode/换行/非法字符 sanitize / decode 默认值/异常输入/结构缺失
  - 行覆盖 100% / 分支 93%
- **评级**：🟢 完善

#### R7 — 章节标题内的 BBCode 处理

- **影响**：章节标题中插入图片/格式，保存后渲染异常
- **相关代码**：`bbcode.ts` 内 `bbcodeTitleToHtml`
- **防护测试**：`bbcodeRoundtrip.test.ts > bbcodeTitleToHtml` × 5（含 previewicon / previewimg / 原始 [img] / fallback）
- **评级**：🟢 完善

### 3.3 图片池 / 上传类

#### R8 — 图片池跨存档污染

- **影响**：A 指南的本地图片漂到 B 指南，或者 A 的已上传图片出现在 B 的图片池里
- **相关代码**：`useSteamGuideImageStore.ts` 的 `refresh` / `loadFromArchive` / `getImagesByGuide` / `linkedGuideId`
- **防护测试**：
  - `useSteamGuideImageStore.test.ts > refresh` × 3（保留当前存档的 pending / 丢弃其他存档的 pending / 更新当前存档 cachedImages）
  - `useSteamGuideImageStore.test.ts > loadFromArchive` × 5
  - `useSteamGuideImageStore.test.ts > getImagesByGuide` × 4
  - `imagePoolIntake.test.ts` 隐含通过 linkedGuideId 参数验证
- **评级**：🟢 完善

#### R9 — 重复上传 / 上传去重失败

- **影响**：同一张图片被上传多次，污染 Steam 图片池，占用用户配额
- **相关代码**：`ImageUploadService.ts` 的 Error 29 检测 + `useSteamGuideImageStore.addLocalImage` 内容哈希去重
- **防护测试**：
  - `ImageUploadService.test.ts > 队列处理 — Error 29 去重` × 2（错误码 29 + "duplicate" 关键字）
  - `ImageUploadService.test.ts > queuePoolUpload 同步守卫 > 池中已存在同名已上传图片 → setPreviewId + skippedCount++`
  - `useSteamGuideImageStore.test.ts > addLocalImage` × 2（哈希去重 uploaded / local）
- **评级**：🟢 完善

#### R10 — 上传队列卡死 / 重试机制失效

- **影响**：上传失败后无限卡 uploading 状态，或不重试直接标错
- **相关代码**：`ImageUploadService.ts:260-510` 的 `processPoolQueue`
- **防护测试**：
  - `队列处理 — 成功路径` × 2（单张成功 + 空 previewIds 视为失败）
  - `队列处理 — 一般错误重试` × 2（连续失败到 maxRetries / 首次失败次次成功）
- **评级**：🟢 完善
- **补充说明**：`ImageUploadService.ts` 行覆盖只有 51%，未覆盖部分是 `uploadEditorImage` 路径（编辑器直接插入图片的上传），不经池队列。该路径失败只影响单次编辑体验，不会丢数据，优先级 🟡

#### R11 — 图片池入池流程（粘贴 / 拖放 / 文件选择）

- **影响**：粘贴图片被错误去重、超限图片被静默吞掉、批量重命名数据丢失
- **相关代码**：`services/imagePoolIntake.ts`
- **防护测试**：`imagePoolIntake.test.ts` 26 tests，覆盖：
  - 单图合规 / 超限 / 剪贴板无名文件补全
  - 多图批量重命名（取消 / 确认 / 部分映射 / 混合超限）
  - 多图直接入池（去重 / 超限跳过 / autoUpload 分流）
  - 行覆盖 99%
- **评级**：🟢 完善

### 3.4 模式切换 / 状态机类

#### R12 — 模式切换（guide/review/offline）数据串流

- **影响**：切模式后残留上一模式的 guideInfo / archive / 图片池
- **相关代码**：`useGuideStore.ts` 的 `setMode` / `setGuideInfo` / `switchArchive`
- **防护测试**：
  - `useGuideStore.test.ts > setMode` × 6（覆盖 4 种模式互切）
  - `setGuideInfo` × 4
  - `switchArchive` × 5
- **评级**：🟢 完善

### 3.5 刻意不测的风险（接受，靠手动验收）

| 风险 | 为什么不测 | 缓解 |
|------|----------|------|
| R13 — Steam 页面 DOM 变动导致 `steamBridge` 抓取失败 | 需要真实 Steam 页面 + Chrome 扩展环境，vitest 无法 mock 到有用程度 | 扩展加载后手动验收；CLAUDE.md 已 flag steamBridge 为 critical |
| R14 — Chrome 扩展 manifest 权限遗漏 | manifest schema 由 Chrome runtime 校验 | build 阶段会 catch；真实加载时 Chrome 报错 |
| R15 — TipTap 扩展渲染（`steamImage` / `steamImageInline` / `spoiler`）异常 | 依赖 TipTap runtime，单测代价 >> 收益 | BBCode roundtrip 间接验证 + 手动验收 |
| R16 — React 组件交互（按钮、对话框、面板） | 需要 React Testing Library，违反"不过度"原则 | 浏览器 DevTools 手动验收 |
| R17 — content script 与 Steam 页面通信 | 无 Chrome API mock | MVP 脚本 in `tests/` + 手动验收 |

---

## 4. 冗余测试识别

扫完 325 个测试，**没有发现明显可删的冗余**。略微可精简的候选：

| 候选 | 测试数 | 删除理由 | 保留理由 | 结论 |
|------|------|--------|--------|------|
| `previewImageBBCode.test.ts > decodePreviewImage 结构缺失` | 5 | 结构异常输入是防御性编程，未必真实触发 | 已出现过 raw 值 null/空字符串的真实 bug（commit `ae2de8f`） | **保留** |
| `useEditorConfigStore > matchShortcut 工具函数` | 10 | 快捷键匹配是小工具函数 | 修饰键组合容易出 bug，且测试跑得快 | **保留** |
| `useEditorConfigStore > 右键菜单 reorderMenuItems` | 3 | UI 细节 | 纯函数 reducer，几乎零维护成本 | **保留** |
| `useArchiveStore > 标签 CRUD` | 10 | 标签功能非核心 | 影响用户组织图片的数据结构，出 bug 会丢标签 | **保留** |

**结论**：当前 325 个测试中无浪费，精简建议为空。

---

## 5. 盲区补强建议（按 ROI 排序）

### 🔴 高 ROI — 必补

**无**。所有高风险路径都已覆盖。

### 🟡 中 ROI — 可延后补

| 补强项 | 估计新增测试数 | 触发条件 |
|-------|-------------|--------|
| `ImageUploadService.uploadEditorImage` 路径 | 3-5 | 若发现编辑器插图上传 bug |
| `useImagePanelStore` persist migrate 测试 | 1-2 | 下次改该 store schema 时 |
| `useImageStore` persist migrate 测试 | 1-2 | 同上 |
| `useSteamGuideImageStore` migrate 预留测试 | 1 | 下次改 schema 版本时 |
| `bbcodeTitleToHtml` 边界场景 | 2-3 | 若发现标题渲染 bug |

这些都不是当前必须做的。**原则：bug 驱动补测，而不是预测性补测**。

### ⚪ 低 ROI — 不推荐

- React 组件测试（ROI < 1）
- TipTap 扩展单测（难以 mock runtime）
- Chrome 扩展 content script 单测（需要完整 Chrome API mock）

这些应**明确拒绝**，集中精力在能真正阻止事故的测试上。

---

## 6. 维护指南 — 给未来的贡献者

### 6.1 PR Checklist（建议加到 PULL_REQUEST_TEMPLATE.md）

```markdown
## 测试 Checklist
- [ ] 修改了 `bbcode.ts` 或 `previewImageBBCode.ts` → `npm run test` 含 roundtrip 测试
- [ ] 修改了 store 的 persist 结构 → 已 bump `version` + 写 `migrate` + 写 migrate 测试
- [ ] 修改了 persist 的 `partialize` → 已验证老数据能兼容
- [ ] 加了用户可见文本 → 已添加 i18n key（zh-CN + en-US）
- [ ] 改动能用单元测试覆盖 → 已添加测试（若属于 §3.5 刻意不测区，说明为何）
```

### 6.2 测试组织约定

| 代码位置 | 测试策略 | 存放位置 |
|---------|---------|---------|
| 核心业务逻辑（utils、stores、services） | vitest 单元测试 | 就近 `__tests__/` 目录 |
| React 组件、TipTap 扩展 | 浏览器 DevTools 手动验收 | 无 |
| Chrome 扩展集成 | MVP 脚本（浏览器 console 粘贴运行） | `tests/` 目录 |
| BBCode 复杂 bug | 先写 MVP → 再加 vitest | `tests/` + `__tests__/` |

### 6.3 DIY 变异测试（可选，用于复核）

想验证测试是否真能抓 bug？故意改坏代码一次，看测试是否变红：

```bash
# 实验 1：去掉 bbcode.ts 一个空行处理
# 预期：bbcodeRoundtrip.test.ts 至少 5 个红

# 实验 2：把 useDraftStore partialize 的 nextDraftNumber 去掉
# 预期：useDraftStore.test.ts > partialize 测试红

# 实验 3：把 useArchiveStore migrate 删掉
# 预期：v0→v1 migrate 测试红

# 验证完 git restore 恢复即可。
```

不需要引入 `stryker-mutator`——这套 DIY 方法对当前项目规模足够。

---

## 7. 结论

| 维度 | 结论 |
|------|------|
| 测试数量 | 325（刚好够用，无浪费） |
| 致命风险覆盖 | 12 条核心风险中 **10 条 🟢 完善 / 2 条 🟡 部分**（都是预留而非当前盲区）/ **5 条 🔴 接受**（刻意不测区） |
| 测试质量 | 核心文件 90%+ 行覆盖，86% 分支覆盖 |
| 冗余程度 | 无显著冗余，精简候选为空 |
| 开源就绪度 | **✅ 可以开源**。现有测试足以防止开源后最常见的 data loss / content corruption 类事故 |

**不推荐追加的工作**：
- ❌ 不要追求把 21% 总覆盖率拉高
- ❌ 不要引入 stryker / playwright / RTL
- ❌ 不要设覆盖率硬阈值
- ❌ 不要为了"看起来更专业"添加低 ROI 测试

**推荐的后续动作**：
1. 把 §6.1 的 PR Checklist 加到 `.github/PULL_REQUEST_TEMPLATE.md`（1 行命令）
2. 当后续发现具体 bug 时，按 §5 的 🟡 列表补测
3. 定期（比如每半年）重新跑一次此审计，更新风险清单
