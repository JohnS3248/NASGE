import { Extension } from "@tiptap/core";
import { useEditorConfigStore, DEFAULT_SHORTCUTS, ShortcutConfig } from "../stores/useEditorConfigStore";

/**
 * 将设置中的快捷键格式转换为 TipTap 格式
 * 设置格式: "Ctrl+Shift+S", "Mod+B"
 * TipTap 格式: "Mod-Shift-s", "Mod-b"
 */
function convertShortcutFormat(shortcut: string): string {
  return shortcut
    .replace(/\+/g, "-")      // Ctrl+B -> Ctrl-B
    .replace(/Ctrl/gi, "Mod") // Ctrl -> Mod (跨平台)
    .replace(/Meta/gi, "Mod") // Meta -> Mod
    .replace(/-([A-Z])$/i, (_, key) => `-${key.toLowerCase()}`); // 最后的键小写
}

export interface KeyboardShortcutsOptions {
  shortcuts?: Partial<ShortcutConfig>;
}

export const KeyboardShortcuts = Extension.create<KeyboardShortcutsOptions>({
  name: "keyboardShortcuts",

  addOptions() {
    return {
      shortcuts: undefined
    };
  },

  addKeyboardShortcuts() {
    // 从 store 获取配置，如果没有则使用默认值
    const storeShortcuts = useEditorConfigStore.getState().shortcuts;
    const shortcuts = this.options.shortcuts || storeShortcuts || DEFAULT_SHORTCUTS;

    // 构建快捷键映射
    const keymap: Record<string, () => boolean> = {};

    // 下划线
    if (shortcuts.toggleUnderline) {
      keymap[convertShortcutFormat(shortcuts.toggleUnderline)] = () =>
        this.editor.commands.toggleUnderline();
    }

    // 删除线
    if (shortcuts.toggleStrike) {
      keymap[convertShortcutFormat(shortcuts.toggleStrike)] = () =>
        this.editor.commands.toggleStrike();
    }

    // 正文段落
    if (shortcuts.setParagraph) {
      keymap[convertShortcutFormat(shortcuts.setParagraph)] = () =>
        this.editor.commands.setParagraph();
    }

    // 一级标题
    if (shortcuts.setHeading1) {
      keymap[convertShortcutFormat(shortcuts.setHeading1)] = () =>
        this.editor.commands.setHeading({ level: 1 });
    }

    // 二级标题
    if (shortcuts.setHeading2) {
      keymap[convertShortcutFormat(shortcuts.setHeading2)] = () =>
        this.editor.commands.setHeading({ level: 2 });
    }

    // 三级标题
    if (shortcuts.setHeading3) {
      keymap[convertShortcutFormat(shortcuts.setHeading3)] = () =>
        this.editor.commands.setHeading({ level: 3 });
    }

    // 代码块
    if (shortcuts.toggleCodeBlock) {
      keymap[convertShortcutFormat(shortcuts.toggleCodeBlock)] = () =>
        this.editor.commands.toggleCodeBlock();
    }

    // 清除格式
    if (shortcuts.clearFormat) {
      keymap[convertShortcutFormat(shortcuts.clearFormat)] = () =>
        this.editor.commands.unsetAllMarks();
    }

    return keymap;
  }
});

export default KeyboardShortcuts;
