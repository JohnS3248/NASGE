/**
 * Noparse — Steam BBCode [noparse] 标签
 *
 * Steam 语义:[noparse] 内任何字符均视为字面,不解析任何 BBCode 标签。
 * NASGE 实现:bbcode.ts 用 \x00 占位机制隔离 noparse 内容,还原时输出
 *   <span data-nasge-noparse="1">字面字符串</span>。
 * 此 Mark 让 TipTap parser 保留该 span(否则 schema 不识别会被 strip),
 * 序列化时 htmlToBBCode 看到该 span 输出 [noparse]textContent[/noparse]。
 *
 * 不暴露 toggle 命令,不绑定快捷键 — author 不主动应用,仅用于拉取 round-trip 保真。
 * excludes "_" 排他所有其他 mark:noparse 内是字面字符串,不能加 strong/em 等格式。
 */
import { Mark, mergeAttributes } from "@tiptap/core";

export interface NoparseOptions {
  HTMLAttributes: Record<string, unknown>;
}

export const Noparse = Mark.create<NoparseOptions>({
  name: "noparse",
  priority: 1100,
  inclusive: false,
  excludes: "_",
  addOptions() {
    return {
      HTMLAttributes: {}
    };
  },
  parseHTML() {
    return [
      {
        tag: "span[data-nasge-noparse]"
      }
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-nasge-noparse": "1"
      }),
      0
    ];
  }
});

export default Noparse;
