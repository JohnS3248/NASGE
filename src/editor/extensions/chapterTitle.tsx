/**
 * chapterTitle TipTap 节点扩展
 *
 * 全篇模式核心：把章节边界以非容器 block 的形式嵌入单个 ProseMirror doc，
 * 用户感知不到边界（光标 / 选区 / 复制粘贴可自由跨越），切片时按节点位置拆 N 章。
 *
 * 三个 PM Plugin：
 *   1. char-limit   — 章节标题超 96 字符自动截断（appendTransaction）
 *   2. delete-guard — 误删边缘 chapterTitle 时弹 confirm
 *   3. paste-guard  — 粘贴外部内容含 chapterTitle 时弹 confirm 询问保留 / 剥离
 */

import { Node } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Slice, Fragment } from "@tiptap/pm/model";
import type { Node as PMNode, Schema } from "@tiptap/pm/model";
import i18n from "i18next";
import { dialog } from "../stores/useDialogStore";
import { loggers } from "../../shared/logger";

/** 章节标题字符上限 */
export const CHAPTER_TITLE_MAX_CHARS = 96;

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    chapterTitle: {
      /** 在当前光标位置插入一个新章节标题节点（文本会被 sanitize + 截断到 96 字符） */
      insertChapterTitle: (text: string) => ReturnType;
      /**
       * 删除当前光标所在的 chapterTitle 节点（合并到前/后正文）。
       * 幂等：光标不在 chapterTitle 内时返回 false 不报错。
       */
      removeChapterTitle: () => ReturnType;
    };
  }
}

/** 去除 NUL 字节 + 截断到上限 */
function sanitizeTitleText(text: string): string {
  return text.replace(/\x00/g, "").slice(0, CHAPTER_TITLE_MAX_CHARS);
}

/**
 * 把 slice 中的 chapterTitle 节点替换为段落（cancel-strip 分支用）
 */
function stripChapterTitlesFromSlice(slice: Slice, schema: Schema): Slice {
  const paragraphType = schema.nodes.paragraph;
  if (!paragraphType) return slice;

  const transformFragment = (frag: Fragment): Fragment => {
    const newNodes: PMNode[] = [];
    frag.forEach((node) => {
      if (node.type.name === "chapterTitle") {
        const text = node.textContent;
        if (text.length > 0) {
          newNodes.push(paragraphType.create(null, schema.text(text)));
        } else {
          newNodes.push(paragraphType.create());
        }
      } else if (node.content.size > 0) {
        const newContent = transformFragment(node.content);
        newNodes.push(node.copy(newContent));
      } else {
        newNodes.push(node);
      }
    });
    return Fragment.fromArray(newNodes);
  };

  return new Slice(
    transformFragment(slice.content),
    slice.openStart,
    slice.openEnd
  );
}

/** Plugin 1：字符上限——超长 chapterTitle 自动截断到 96 字符 */
function buildCharLimitPlugin(): Plugin {
  return new Plugin({
    key: new PluginKey("chapter-title-char-limit"),
    appendTransaction(transactions, _oldState, newState) {
      if (!transactions.some((tr) => tr.docChanged)) return null;

      let tr = newState.tr;
      let modified = false;

      newState.doc.descendants((node, pos) => {
        if (node.type.name !== "chapterTitle") return;
        const text = node.textContent;
        if (text.length <= CHAPTER_TITLE_MAX_CHARS) return false;

        const trimmed = text.slice(0, CHAPTER_TITLE_MAX_CHARS);
        const start = pos + 1;
        const end = pos + 1 + node.content.size;

        if (trimmed.length > 0) {
          tr = tr.replaceWith(start, end, node.type.schema.text(trimmed));
        } else {
          tr = tr.delete(start, end);
        }
        modified = true;
        return false;
      });

      return modified ? tr : null;
    },
  });
}

/** Plugin 2：删除拦截（R1）—— Backspace at start / Delete at end-of-prev-block 弹 confirm */
function buildDeleteGuardPlugin(): Plugin {
  return new Plugin({
    key: new PluginKey("chapter-title-delete-guard"),
    props: {
      handleKeyDown(view, event) {
        if (event.key !== "Backspace" && event.key !== "Delete") return false;
        const { selection } = view.state;
        if (!selection.empty) return false;
        const { $from } = selection;

        // Case 1: Backspace 在 chapterTitle 节点开头
        const inChapterTitle = $from.parent.type.name === "chapterTitle";
        const chapterTitleNodePos =
          inChapterTitle && $from.depth > 0 ? $from.before($from.depth) : -1;
        const isAtChapterTitleStart =
          event.key === "Backspace" &&
          inChapterTitle &&
          $from.parentOffset === 0 &&
          chapterTitleNodePos > 0;

        // Case 2: Delete 在某 block 末尾、紧接的下一个节点是 chapterTitle
        let nextChapterTitlePos = -1;
        if (
          event.key === "Delete" &&
          $from.parentOffset === $from.parent.content.size &&
          $from.depth > 0
        ) {
          const after = $from.after();
          if (after < view.state.doc.content.size) {
            const nextNode = view.state.doc.nodeAt(after);
            if (nextNode?.type.name === "chapterTitle") {
              nextChapterTitlePos = after;
            }
          }
        }

        const targetPos = isAtChapterTitleStart
          ? chapterTitleNodePos
          : nextChapterTitlePos;
        if (targetPos < 0) return false;

        const targetNode = view.state.doc.nodeAt(targetPos);
        if (!targetNode || targetNode.type.name !== "chapterTitle") return false;

        event.preventDefault();
        const titleText = targetNode.textContent;

        void dialog
          .confirm({
            title: i18n.t("wholeGuide.deleteChapterTitle.title", {
              ns: "editor",
            }),
            message: i18n.t("wholeGuide.deleteChapterTitle.message", {
              ns: "editor",
              title: titleText,
            }),
            confirmText: i18n.t("wholeGuide.deleteChapterTitle.confirm", {
              ns: "editor",
            }),
            danger: true,
          })
          .then((confirmed) => {
            if (!confirmed) return;
            // 重读 doc 状态——dialog 期间用户无操作但保险起见再校验
            const node = view.state.doc.nodeAt(targetPos);
            if (!node || node.type.name !== "chapterTitle") return;
            const tr = view.state.tr.delete(
              targetPos,
              targetPos + node.nodeSize
            );
            view.dispatch(tr);
            view.focus();
            loggers.editor.info("删除 chapterTitle 节点", {
              pos: targetPos,
              title: titleText,
            });
          });

        return true;
      },
    },
  });
}

/** Plugin 3：粘贴拦截（R3）—— slice 含 chapterTitle 时弹 confirm */
function buildPasteGuardPlugin(): Plugin {
  return new Plugin({
    key: new PluginKey("chapter-title-paste-guard"),
    props: {
      handlePaste(view, _event, slice) {
        let chapterTitleCount = 0;
        slice.content.descendants((node) => {
          if (node.type.name === "chapterTitle") {
            chapterTitleCount++;
          }
        });

        if (chapterTitleCount === 0) return false;

        const cachedSlice = slice;
        const schema = view.state.schema;

        void dialog
          .confirm({
            title: i18n.t("wholeGuide.pasteChapterTitle.title", {
              ns: "editor",
            }),
            message: i18n.t("wholeGuide.pasteChapterTitle.message", {
              ns: "editor",
              count: chapterTitleCount,
            }),
            confirmText: i18n.t("wholeGuide.pasteChapterTitle.confirm", {
              ns: "editor",
            }),
            cancelText: i18n.t("wholeGuide.pasteChapterTitle.cancelStrip", {
              ns: "editor",
            }),
          })
          .then((keepTitles) => {
            const finalSlice = keepTitles
              ? cachedSlice
              : stripChapterTitlesFromSlice(cachedSlice, schema);
            const tr = view.state.tr.replaceSelection(finalSlice);
            view.dispatch(tr);
            view.focus();
            loggers.editor.info("处理含章节标题的粘贴", {
              count: chapterTitleCount,
              kept: keepTitles,
            });
          });

        return true;
      },
    },
  });
}

export const ChapterTitle = Node.create({
  name: "chapterTitle",
  group: "block",
  content: "text*",
  // 章节标题允许的 inline marks（与 Steam 章节标题渲染一致）
  marks: "bold italic underline strike spoiler",
  defining: false,
  isolating: false,
  selectable: false,
  draggable: false,

  parseHTML() {
    return [{ tag: 'h1[data-chapter-title="true"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "h1",
      {
        ...HTMLAttributes,
        "data-chapter-title": "true",
        class: "nasge-chapter-title",
      },
      0,
    ];
  },

  addCommands() {
    return {
      insertChapterTitle:
        (text: string) =>
        ({ commands }) => {
          const sanitized = sanitizeTitleText(text);
          return commands.insertContent({
            type: "chapterTitle",
            content:
              sanitized.length > 0
                ? [{ type: "text", text: sanitized }]
                : undefined,
          });
        },

      removeChapterTitle:
        () =>
        ({ state, dispatch }) => {
          const { $from } = state.selection;
          let targetPos = -1;
          for (let depth = $from.depth; depth >= 0; depth--) {
            const node = $from.node(depth);
            if (node.type.name === "chapterTitle") {
              targetPos = $from.before(depth);
              break;
            }
          }
          if (targetPos < 0) return false;
          const node = state.doc.nodeAt(targetPos);
          if (!node || node.type.name !== "chapterTitle") return false;
          if (dispatch) {
            dispatch(state.tr.delete(targetPos, targetPos + node.nodeSize));
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      buildCharLimitPlugin(),
      buildDeleteGuardPlugin(),
      buildPasteGuardPlugin(),
    ];
  },
});

export default ChapterTitle;
