<!--
感谢你为 NASGE 贡献代码！
请填写下面的 summary 和 checklist。测试项详细说明见 [TESTING.md](../TESTING.md)。
-->

## Summary

<!-- 一两句话说明这个 PR 做了什么、为什么需要 -->

## 测试 Checklist

- [ ] 本地跑过 `npm run type-check`
- [ ] 本地跑过 `npm run test`
- [ ] 本地跑过 `npm run build`

### 改动涉及以下区域时需要额外确认

- [ ] **BBCode 转换**（`bbcode.ts` / `previewImageBBCode.ts`）：roundtrip 测试全绿；必要时在 `bbcodeRoundtrip.test.ts` 或 `fixtureRoundtrip.test.ts` 补测试用例
- [ ] **Store persist 结构**（加/删/改字段）：已 bump `version` + 写 `migrate` + 写 migrate 测试（参考 `useArchiveStore.test.ts > persist / migrate`）
- [ ] **Store partialize**：已验证老数据能兼容读取
- [ ] **用户可见文本**（按钮、toast、dialog 等）：已同步添加 `zh-CN` 和 `en-US` 的 i18n key
- [ ] **Chrome 扩展权限**（`manifest.config.ts`）：新权限有明确理由，已在 PR 说明中解释
- [ ] **Steam 页面交互**（`content/steamBridge.ts`）：在真实 Steam 指南编辑页面手动验证通过

### 致命风险区免责

NASGE 有一部分代码刻意不做单元测试（React 组件、TipTap 扩展、Chrome 集成），靠手动验收。如果你的改动属于这部分，请：

- [ ] 在 PR 说明中描述手动验证的步骤和结果（最好附截图）

## 截图 / 录屏（如适用）

<!-- UI 改动请附截图或录屏 -->

## 相关 Issue

<!-- Closes #xxx -->
