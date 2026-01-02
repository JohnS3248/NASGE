import { Mark, mergeAttributes } from "@tiptap/core";
import { useEditorConfigStore, DEFAULT_SHORTCUTS } from "../stores/useEditorConfigStore";

export interface SpoilerOptions {
  HTMLAttributes: Record<string, any>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    spoiler: {
      setSpoiler: () => ReturnType;
      toggleSpoiler: () => ReturnType;
      unsetSpoiler: () => ReturnType;
    };
  }
}

export const Spoiler = Mark.create<SpoilerOptions>({
  name: "spoiler",
  priority: 1000,
  inclusive: true,
  addOptions() {
    return {
      HTMLAttributes: {
        class: "nasge-spoiler"
      }
    };
  },
  parseHTML() {
    return [
      {
        tag: "span[data-nasge-spoiler]"
      }
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-nasge-spoiler": ""
      }),
      0
    ];
  },
  addCommands() {
    return {
      setSpoiler:
        () =>
        ({ commands }) =>
          commands.setMark(this.name),
      toggleSpoiler:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name),
      unsetSpoiler:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name)
    };
  },
  addKeyboardShortcuts() {
    // 从 store 获取配置
    const shortcuts = useEditorConfigStore.getState().shortcuts || DEFAULT_SHORTCUTS;
    const shortcut = shortcuts.toggleSpoiler || "Mod+H";

    // 转换格式: "Mod+H" -> "Mod-h"
    const tiptapKey = shortcut
      .replace(/\+/g, "-")
      .replace(/Ctrl/gi, "Mod")
      .replace(/Meta/gi, "Mod")
      .replace(/-([A-Z])$/i, (_, key) => `-${key.toLowerCase()}`);

    return {
      [tiptapKey]: () => this.editor.commands.toggleSpoiler()
    };
  }
});

export default Spoiler;
