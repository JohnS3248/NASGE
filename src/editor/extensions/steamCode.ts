/**
 * SteamCode — Steam BBCode [code] 容器节点
 *
 * 与 Steam 官方一致:[code] 只是等宽 + 灰背景的样式容器,**内部 BBCode 仍照常解析**,
 * 不是 noparse 字面保留容器。
 *
 * Steam 渲染:[code][b]X[/b][h1]Y[/h1][/code] →
 *   <div class="bb_code"><b>X</b><div class="bb_h1">Y</div></div>
 *
 * NASGE 渲染:同结构,容器用 <pre data-nasge-code="1" class="nasge-code">,
 * content schema 'block+' 允许内部嵌套 paragraph / heading / list 等 block,
 * paragraph 内可含 inline mark(strong/em/u/...)。
 *
 * 替代 StarterKit 默认的 codeBlock(plain-text-only),否则 [code] 内 inline mark 与
 * 嵌套 heading 会被 schema 剥离。
 */
import { Node, mergeAttributes } from "@tiptap/core";

export interface SteamCodeOptions {
  HTMLAttributes: Record<string, unknown>;
}

export const SteamCode = Node.create<SteamCodeOptions>({
  name: "steamCode",
  group: "block",
  content: "block+",
  defining: true,
  addOptions() {
    return {
      HTMLAttributes: {}
    };
  },
  parseHTML() {
    return [
      { tag: "pre[data-nasge-code]" },
      { tag: "div[data-nasge-code]" },
      { tag: "div.bb_code" }
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "pre",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-nasge-code": "1",
        class: "nasge-code"
      }),
      0
    ];
  }
});

export default SteamCode;
