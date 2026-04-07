/**
 * useEditorConfigStore 测试
 *
 * 覆盖：
 * - 初始状态 = DEFAULT_CONFIG
 * - 基础 setter（autoUpload / promptRename / debugMode / locale / theme / alignment ...）
 * - 快捷键：setShortcut / resetShortcuts + matchShortcut 工具函数
 * - smartLayout 阈值 clamp（200-2000）
 * - 右键菜单：enable / itemEnabled / reorder / reset（image 分组 + 其他三类）
 * - reset() 恢复全部
 * - persist：partialize / merge 填充缺失字段 + onRehydrateStorage 同步 debugMode
 * - mergeContextMenuConfig：保留用户顺序 + 追加新项
 * - mergeImageMenuConfig：分组内同样规则
 */
import { describe, expect, it, vi } from "vitest";

// 测试环境没 init i18next，setLocale 会在裸 i18n 实例上调用 changeLanguage
// 导致 hasLanguageSomeTranslations undefined 报错。这里用最小 stub 替换。
vi.mock("../../../i18n", () => ({
  i18n: {
    changeLanguage: vi.fn()
  },
  resolveLocale: (l: string) => (l === "auto" ? "zh-CN" : l)
}));

import type {
  useEditorConfigStore as UseEditorConfigStoreType,
  ShortcutConfig
} from "../useEditorConfigStore";

type Store = typeof UseEditorConfigStoreType;

async function importFreshStore(): Promise<Store> {
  vi.resetModules();
  const mod = await import("../useEditorConfigStore");
  return mod.useEditorConfigStore;
}

async function importMatchShortcut() {
  vi.resetModules();
  const mod = await import("../useEditorConfigStore");
  return mod.matchShortcut;
}

// ============================================================================
// 初始状态
// ============================================================================
describe("初始状态", () => {
  it("默认值与 DEFAULT_CONFIG 一致", async () => {
    const store = await importFreshStore();
    const s = store.getState();
    expect(s.autoUploadInPanel).toBe(false);
    expect(s.promptRenameOnPaste).toBe(true);
    expect(s.promptRenameOnDrop).toBe(true);
    expect(s.debugMode).toBe(false);
    expect(s.locale).toBe("auto");
    expect(s.theme).toBe("steam-dark");
    expect(s.smartLayoutEnabled).toBe(false);
    expect(s.smartLayoutWidthThreshold).toBe(800);
    expect(s.smartLayoutHeightThreshold).toBe(600);
    expect(s.editorAlignment).toBe("center");
    expect(s.toolbarDockMode).toBe("side");
    expect(s.showPreview).toBe(false);
    expect(s.chapterNavMode).toBe("fixed");
    expect(s.shortcuts.toggleBold).toBe("Mod+B");
  });
});

// ============================================================================
// 基础 setter
// ============================================================================
describe("基础 setter", () => {
  it("setAutoUploadInPanel / setPromptRenameOnPaste / setPromptRenameOnDrop", async () => {
    const store = await importFreshStore();
    store.getState().setAutoUploadInPanel(true);
    store.getState().setPromptRenameOnPaste(false);
    store.getState().setPromptRenameOnDrop(false);
    const s = store.getState();
    expect(s.autoUploadInPanel).toBe(true);
    expect(s.promptRenameOnPaste).toBe(false);
    expect(s.promptRenameOnDrop).toBe(false);
  });

  it("setDebugMode", async () => {
    const store = await importFreshStore();
    store.getState().setDebugMode(true);
    expect(store.getState().debugMode).toBe(true);
    store.getState().setDebugMode(false);
    expect(store.getState().debugMode).toBe(false);
  });

  it("setLocale", async () => {
    const store = await importFreshStore();
    store.getState().setLocale("en-US");
    expect(store.getState().locale).toBe("en-US");
  });

  it("setTheme 同步 document.documentElement.dataset.theme", async () => {
    const store = await importFreshStore();
    store.getState().setTheme("midnight");
    expect(store.getState().theme).toBe("midnight");
    expect(document.documentElement.dataset.theme).toBe("midnight");
  });

  it("setEditorAlignment / setToolbarDockMode / setShowPreview", async () => {
    const store = await importFreshStore();
    store.getState().setEditorAlignment("left");
    store.getState().setToolbarDockMode("top");
    store.getState().setShowPreview(true);
    const s = store.getState();
    expect(s.editorAlignment).toBe("left");
    expect(s.toolbarDockMode).toBe("top");
    expect(s.showPreview).toBe(true);
  });

  it("setToolbarPos / setChapterNavPos", async () => {
    const store = await importFreshStore();
    store.getState().setToolbarPos({ x: 10, y: 20 });
    store.getState().setChapterNavPos({ x: 30, y: 40 });
    expect(store.getState().toolbarPos).toEqual({ x: 10, y: 20 });
    expect(store.getState().chapterNavPos).toEqual({ x: 30, y: 40 });
  });

  it("setChapterNavMode", async () => {
    const store = await importFreshStore();
    store.getState().setChapterNavMode("movable");
    expect(store.getState().chapterNavMode).toBe("movable");
  });
});

// ============================================================================
// 快捷键
// ============================================================================
describe("快捷键 setShortcut / resetShortcuts", () => {
  it("setShortcut 仅更新指定项，其他保持", async () => {
    const store = await importFreshStore();
    store.getState().setShortcut("toggleBold", "Ctrl+B");
    const s = store.getState();
    expect(s.shortcuts.toggleBold).toBe("Ctrl+B");
    // 其他项不变
    expect(s.shortcuts.toggleItalic).toBe("Mod+I");
  });

  it("resetShortcuts 恢复默认", async () => {
    const store = await importFreshStore();
    store.getState().setShortcut("toggleBold", "X");
    store.getState().setShortcut("renameImage", "Y");
    store.getState().resetShortcuts();
    const s = store.getState();
    expect(s.shortcuts.toggleBold).toBe("Mod+B");
    expect(s.shortcuts.renameImage).toBe("F2");
  });
});

describe("matchShortcut 工具函数", () => {
  function ev(opts: Partial<KeyboardEvent>): KeyboardEvent {
    return {
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
      key: "",
      ...opts
    } as KeyboardEvent;
  }

  it("修饰键完全匹配", async () => {
    const matchShortcut = await importMatchShortcut();
    expect(matchShortcut(ev({ ctrlKey: true, key: "b" }), "Ctrl+B")).toBe(true);
  });

  it("修饰键缺失返回 false", async () => {
    const matchShortcut = await importMatchShortcut();
    expect(matchShortcut(ev({ key: "b" }), "Ctrl+B")).toBe(false);
  });

  it("多修饰键", async () => {
    const matchShortcut = await importMatchShortcut();
    expect(
      matchShortcut(
        ev({ ctrlKey: true, shiftKey: true, key: "s" }),
        "Ctrl+Shift+S"
      )
    ).toBe(true);
  });

  it("Alt / Meta 单独生效", async () => {
    const matchShortcut = await importMatchShortcut();
    expect(matchShortcut(ev({ altKey: true, key: "x" }), "Alt+X")).toBe(true);
    expect(matchShortcut(ev({ metaKey: true, key: "x" }), "Meta+X")).toBe(true);
  });

  it("额外的 shift 不应匹配", async () => {
    const matchShortcut = await importMatchShortcut();
    expect(
      matchShortcut(ev({ ctrlKey: true, shiftKey: true, key: "b" }), "Ctrl+B")
    ).toBe(false);
  });

  it("space 特殊映射", async () => {
    const matchShortcut = await importMatchShortcut();
    expect(matchShortcut(ev({ key: " " }), "Space")).toBe(true);
  });

  it("Delete / Escape 特殊映射", async () => {
    const matchShortcut = await importMatchShortcut();
    expect(matchShortcut(ev({ key: "Delete" }), "Delete")).toBe(true);
    expect(matchShortcut(ev({ key: "Escape" }), "Escape")).toBe(true);
  });

  it("F2 功能键", async () => {
    const matchShortcut = await importMatchShortcut();
    expect(matchShortcut(ev({ key: "F2" }), "F2")).toBe(true);
  });

  it("主键不匹配返回 false", async () => {
    const matchShortcut = await importMatchShortcut();
    expect(matchShortcut(ev({ ctrlKey: true, key: "a" }), "Ctrl+B")).toBe(false);
  });
});

// ============================================================================
// smart layout 阈值 clamp
// ============================================================================
describe("smartLayout 阈值 clamp", () => {
  it("setSmartLayoutEnabled", async () => {
    const store = await importFreshStore();
    store.getState().setSmartLayoutEnabled(true);
    expect(store.getState().smartLayoutEnabled).toBe(true);
  });

  it("Width 小于 200 被 clamp 到 200", async () => {
    const store = await importFreshStore();
    store.getState().setSmartLayoutWidthThreshold(50);
    expect(store.getState().smartLayoutWidthThreshold).toBe(200);
  });

  it("Width 大于 2000 被 clamp 到 2000", async () => {
    const store = await importFreshStore();
    store.getState().setSmartLayoutWidthThreshold(3000);
    expect(store.getState().smartLayoutWidthThreshold).toBe(2000);
  });

  it("Width 正常范围不变", async () => {
    const store = await importFreshStore();
    store.getState().setSmartLayoutWidthThreshold(1234);
    expect(store.getState().smartLayoutWidthThreshold).toBe(1234);
  });

  it("Height 同样 clamp", async () => {
    const store = await importFreshStore();
    store.getState().setSmartLayoutHeightThreshold(100);
    expect(store.getState().smartLayoutHeightThreshold).toBe(200);
    store.getState().setSmartLayoutHeightThreshold(5000);
    expect(store.getState().smartLayoutHeightThreshold).toBe(2000);
    store.getState().setSmartLayoutHeightThreshold(777);
    expect(store.getState().smartLayoutHeightThreshold).toBe(777);
  });
});

// ============================================================================
// 右键菜单：enable / itemEnabled / reorder / reset
// ============================================================================
describe("右键菜单 setContextMenuEnabled", () => {
  it("分别切 4 种菜单的 enabled", async () => {
    const store = await importFreshStore();
    store.getState().setContextMenuEnabled("image", false);
    store.getState().setContextMenuEnabled("selection", false);
    store.getState().setContextMenuEnabled("empty", false);
    store.getState().setContextMenuEnabled("imagePool", false);
    const s = store.getState();
    expect(s.imageMenuConfig.enabled).toBe(false);
    expect(s.selectionMenuConfig.enabled).toBe(false);
    expect(s.emptyMenuConfig.enabled).toBe(false);
    expect(s.imagePoolMenuConfig.enabled).toBe(false);
  });
});

describe("右键菜单 setMenuItemEnabled", () => {
  it("image 菜单按 groupId 切某个 item", async () => {
    const store = await importFreshStore();
    store.getState().setMenuItemEnabled("image", "preset-half", false, "preset");
    const preset = store
      .getState()
      .imageMenuConfig.groups.find(g => g.groupId === "preset")!;
    const half = preset.items.find(i => i.id === "preset-half")!;
    expect(half.enabled).toBe(false);
    // 其他项不受影响
    expect(preset.items.find(i => i.id === "preset-original")!.enabled).toBe(true);
  });

  it("selection 菜单切某项", async () => {
    const store = await importFreshStore();
    store.getState().setMenuItemEnabled("selection", "bold", false);
    const bold = store
      .getState()
      .selectionMenuConfig.items.find(i => i.id === "bold")!;
    expect(bold.enabled).toBe(false);
  });

  it("empty 菜单切某项", async () => {
    const store = await importFreshStore();
    store.getState().setMenuItemEnabled("empty", "codeBlock", false);
    const item = store
      .getState()
      .emptyMenuConfig.items.find(i => i.id === "codeBlock")!;
    expect(item.enabled).toBe(false);
  });

  it("imagePool 菜单切某项", async () => {
    const store = await importFreshStore();
    store.getState().setMenuItemEnabled("imagePool", "tags", false);
    const item = store
      .getState()
      .imagePoolMenuConfig.items.find(i => i.id === "tags")!;
    expect(item.enabled).toBe(false);
  });
});

describe("右键菜单 reorderMenuItems", () => {
  it("image 菜单按分组重排序", async () => {
    const store = await importFreshStore();
    store.getState().reorderMenuItems(
      "image",
      ["preset-full", "preset-original", "preset-half"],
      "preset"
    );
    const preset = store
      .getState()
      .imageMenuConfig.groups.find(g => g.groupId === "preset")!;
    expect(preset.items.map(i => i.id)).toEqual([
      "preset-full",
      "preset-original",
      "preset-half"
    ]);
  });

  it("image 菜单重排忽略未知 itemId", async () => {
    const store = await importFreshStore();
    store.getState().reorderMenuItems(
      "image",
      ["preset-full", "ghost", "preset-original"],
      "preset"
    );
    const preset = store
      .getState()
      .imageMenuConfig.groups.find(g => g.groupId === "preset")!;
    expect(preset.items.map(i => i.id)).toEqual(["preset-full", "preset-original"]);
  });

  it("selection 菜单重排", async () => {
    const store = await importFreshStore();
    store.getState().reorderMenuItems("selection", ["bold", "italic"]);
    const ids = store.getState().selectionMenuConfig.items.map(i => i.id);
    expect(ids).toEqual(["bold", "italic"]);
  });
});

describe("右键菜单 resetContextMenuConfig", () => {
  it("image 菜单重置", async () => {
    const store = await importFreshStore();
    store.getState().setContextMenuEnabled("image", false);
    store.getState().reorderMenuItems("image", ["preset-full"], "preset");
    store.getState().resetContextMenuConfig("image");
    const s = store.getState();
    expect(s.imageMenuConfig.enabled).toBe(true);
    const preset = s.imageMenuConfig.groups.find(g => g.groupId === "preset")!;
    expect(preset.items.map(i => i.id)).toEqual([
      "preset-original",
      "preset-half",
      "preset-full"
    ]);
  });

  it("selection / empty / imagePool 菜单重置", async () => {
    const store = await importFreshStore();
    store.getState().setContextMenuEnabled("selection", false);
    store.getState().setContextMenuEnabled("empty", false);
    store.getState().setContextMenuEnabled("imagePool", false);
    store.getState().resetContextMenuConfig("selection");
    store.getState().resetContextMenuConfig("empty");
    store.getState().resetContextMenuConfig("imagePool");
    const s = store.getState();
    expect(s.selectionMenuConfig.enabled).toBe(true);
    expect(s.emptyMenuConfig.enabled).toBe(true);
    expect(s.imagePoolMenuConfig.enabled).toBe(true);
  });
});

// ============================================================================
// reset 全量
// ============================================================================
describe("reset 全量恢复", () => {
  it("修改后 reset 回到默认", async () => {
    const store = await importFreshStore();
    store.getState().setDebugMode(true);
    store.getState().setTheme("midnight");
    store.getState().setShortcut("toggleBold", "X");
    store.getState().setSmartLayoutEnabled(true);
    store.getState().reset();
    const s = store.getState();
    expect(s.debugMode).toBe(false);
    expect(s.theme).toBe("steam-dark");
    expect(s.shortcuts.toggleBold).toBe("Mod+B");
    expect(s.smartLayoutEnabled).toBe(false);
  });
});

// ============================================================================
// persist / merge / rehydrate
// ============================================================================
describe("persist / merge / rehydrate", () => {
  const STORE_KEY = "nasge-editor-config";

  function writePersisted(state: Record<string, unknown>, version = 0) {
    localStorage.setItem(STORE_KEY, JSON.stringify({ state, version }));
  }

  it("空 persist → 使用默认值", async () => {
    const store = await importFreshStore();
    expect(store.getState().theme).toBe("steam-dark");
  });

  it("部分字段缺失 → merge 自动填充默认", async () => {
    writePersisted({ theme: "classic" });
    const store = await importFreshStore();
    const s = store.getState();
    expect(s.theme).toBe("classic");
    // 缺失字段填充默认
    expect(s.smartLayoutEnabled).toBe(false);
    expect(s.editorAlignment).toBe("center");
    expect(s.showPreview).toBe(false);
  });

  it("shortcuts 深合并：新增快捷键有默认值", async () => {
    // 只持久化一部分 shortcuts
    writePersisted({
      shortcuts: { toggleBold: "Custom+B" } as Partial<ShortcutConfig>
    });
    const store = await importFreshStore();
    const s = store.getState();
    expect(s.shortcuts.toggleBold).toBe("Custom+B");
    // 未持久化的字段仍然是默认
    expect(s.shortcuts.toggleItalic).toBe("Mod+I");
    expect(s.shortcuts.renameImage).toBe("F2");
  });

  it("selectionMenuConfig 只有部分 item → merge 追加新项", async () => {
    writePersisted({
      selectionMenuConfig: {
        enabled: true,
        items: [
          { id: "bold", enabled: false } // 用户只保留并禁用了 bold
        ]
      }
    });
    const store = await importFreshStore();
    const items = store.getState().selectionMenuConfig.items;
    // bold 保留用户的 enabled=false
    const bold = items.find(i => i.id === "bold")!;
    expect(bold.enabled).toBe(false);
    // 默认项追加进来
    expect(items.find(i => i.id === "italic")).toBeDefined();
    expect(items.find(i => i.id === "strike")).toBeDefined();
    // 用户的项在前
    expect(items[0].id).toBe("bold");
  });

  it("selectionMenuConfig 完全缺失 → 使用默认", async () => {
    writePersisted({ theme: "midnight" });
    const store = await importFreshStore();
    const items = store.getState().selectionMenuConfig.items;
    expect(items.length).toBeGreaterThan(0);
    expect(items.find(i => i.id === "bold")).toBeDefined();
  });

  it("imageMenuConfig 只持久化 preset 分组的一部分 → merge 追加", async () => {
    writePersisted({
      imageMenuConfig: {
        enabled: true,
        groups: [
          {
            groupId: "preset",
            items: [{ id: "preset-full", enabled: true }]
          }
        ]
      }
    });
    const store = await importFreshStore();
    const groups = store.getState().imageMenuConfig.groups;
    // 3 个分组都在（即使只持久化了 preset）
    expect(groups.map(g => g.groupId)).toEqual(["preset", "align", "action"]);
    const preset = groups.find(g => g.groupId === "preset")!;
    // preset-full 保持用户顺序在前，其他追加
    expect(preset.items[0].id).toBe("preset-full");
    expect(preset.items.find(i => i.id === "preset-half")).toBeDefined();
    expect(preset.items.find(i => i.id === "preset-original")).toBeDefined();
  });

  it("imageMenuConfig 完全缺失 → 使用默认", async () => {
    writePersisted({ theme: "classic" });
    const store = await importFreshStore();
    const groups = store.getState().imageMenuConfig.groups;
    expect(groups.map(g => g.groupId)).toEqual(["preset", "align", "action"]);
  });

  it("persist 后再 rehydrate 能读回", async () => {
    // 第一次写入
    {
      const store = await importFreshStore();
      store.getState().setTheme("midnight");
      store.getState().setDebugMode(true);
      store.getState().setSmartLayoutEnabled(true);
    }
    // 第二次新模块 → 从 localStorage 读回
    const store2 = await importFreshStore();
    const s = store2.getState();
    expect(s.theme).toBe("midnight");
    expect(s.debugMode).toBe(true);
    expect(s.smartLayoutEnabled).toBe(true);
  });
});
