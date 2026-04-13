# Changelog / 更新日志

All notable changes to NASGE will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

---

## [1.0.0] — 2026-04

### New Features / 全新特性

- Complete UI overhaul — rebuilt all interfaces with Tailwind CSS v4, three themes (Steam Dark / Midnight / Classic)
- Full bilingual support — Chinese / English / auto-detect from system language
- Review mode — create and update Steam reviews directly from the game store page, with recommend/not recommend, visibility, language settings
- Game screenshots — new Screenshots tab in image pool, browse and drag game screenshots into the editor
- External image insertion — insert external HTTPS image URLs via context menu, with automatic Steam compatibility check
- Image upload improvements — Steam 2MB size validation, batch rename, drag routing fixes
- Onboarding tour — basic + advanced two-stage interactive tour, replayable from settings
- Unified error handling — Steam EResult error classification + human-readable i18n error messages
- Toast notification system — replaced all window.alert() with elegant notification toasts

### Improvements / 改进

- Three toolbar dock modes — side, top, floating, freely switchable
- Skeleton screens + transitions — loading and transition animations for editor, image pool, preview panel, and modals
- Chapter navigation dual mode — fixed (embedded in sidebar) and draggable (floating)
- Multi-window session isolation — opening multiple editor windows no longer interferes with each other
- Nested table support — insert sub-tables inside table cells via context menu
- Context menu overflow prevention — menu auto-repositions after render to stay within viewport
- Dialog system enhancement — supports multiline text input with character count

### Bug Fixes / 修复

- BBCode roundtrip fixes — [code] content no longer parsed, [url] bare format, inline+sizeFull image tags, filename suffix pollution
- Image pool fixes — paste handling only first image, thumbnail URL misuse causing blurry images
- Multi Steam tab routing fix — correctly routes to guide editing page when multiple Steam tabs are open
- Draft isolation fixes — activeDraftId multi-window isolation, review draft bound to game appId to prevent cross-game overwrites
- Preview panel race condition fix — guideInfo race condition + chapter switch skeleton timing

### Removed / 移除

- Removed "draft binding" feature — poorly designed and deprecated. Drafts are now automatically isolated by mode without manual binding
