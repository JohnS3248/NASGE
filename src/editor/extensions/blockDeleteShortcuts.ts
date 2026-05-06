/**
 * BlockDeleteShortcuts — 容器块快捷删除 / 选中
 *
 * 原痛点:[quote] / [code] 等容器块光标在内部时按 Backspace 不能删整块,
 * 只能逐字符 backspace 退到 outdent / lift 行为,不直观。
 *
 * 这个 Extension 加两个键位:
 *   - Esc        — selectParentNode:逐级把 selection 上升到父节点(text → paragraph → 容器),
 *                   多次 Esc 一路升到顶。选中状态(NodeSelection 蓝框)按 Backspace 即删整块。
 *   - Mod-Shift-Backspace — 一键直接删除当前光标所在最近的容器型块。
 *
 * 容器型块白名单(避免误删 paragraph / chapterTitle 等关键节点):
 *   blockquote / steamCode / bulletList / orderedList / table
 *
 * chapterTitle 不在白名单 — 全篇模式章节排序通过另一节点机制实现,删除应走专用 UI。
 */
import { Extension } from "@tiptap/core";

const CONTAINER_TYPES = new Set([
  "blockquote",
  "steamCode",
  "bulletList",
  "orderedList",
  "table"
]);

export const BlockDeleteShortcuts = Extension.create({
  name: "blockDeleteShortcuts",

  addKeyboardShortcuts() {
    return {
      Escape: ({ editor }) => {
        // selectParentNode 在没有可上升节点时返回 false,正常文本输入框 Esc 不会被吞
        return editor.commands.selectParentNode();
      },

      "Mod-Shift-Backspace": ({ editor }) => {
        const { selection } = editor.state;
        const $from = selection.$from;
        for (let depth = $from.depth; depth > 0; depth--) {
          const node = $from.node(depth);
          if (CONTAINER_TYPES.has(node.type.name)) {
            const containerPos = $from.before(depth);
            return editor
              .chain()
              .setNodeSelection(containerPos)
              .deleteSelection()
              .run();
          }
        }
        return false;
      }
    };
  }
});

export default BlockDeleteShortcuts;
