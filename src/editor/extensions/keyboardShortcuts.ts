import { Extension } from "@tiptap/core";

export const KeyboardShortcuts = Extension.create({
  name: "keyboardShortcuts",

  addKeyboardShortcuts() {
    return {
      // 下划线
      "Mod-u": () => this.editor.commands.toggleUnderline(),

      // 删除线
      "Mod-Shift-s": () => this.editor.commands.toggleStrike(),

      // 正文段落
      "Mod-0": () => this.editor.commands.setParagraph(),

      // 标题
      "Mod-1": () => this.editor.commands.setHeading({ level: 1 }),
      "Mod-2": () => this.editor.commands.setHeading({ level: 2 }),
      "Mod-3": () => this.editor.commands.setHeading({ level: 3 }),

      // 代码块
      "Mod-k": () => this.editor.commands.toggleCodeBlock(),

      // 清除格式
      "Mod-\\": () => this.editor.commands.unsetAllMarks()
    };
  }
});

export default KeyboardShortcuts;
