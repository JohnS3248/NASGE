import { Mark, mergeAttributes } from "@tiptap/core";

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
    return {
      "Mod-h": () => this.editor.commands.toggleSpoiler()
    };
  }
});

export default Spoiler;
