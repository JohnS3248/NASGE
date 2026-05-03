import { Extensions, JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Strike from "@tiptap/extension-strike";
import Heading from "@tiptap/extension-heading";
import Link from "@tiptap/extension-link";
import { mergeAttributes } from "@tiptap/core";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import Image from "@tiptap/extension-image";

import Spoiler from "../extensions/spoiler";
import KeyboardShortcuts from "../extensions/keyboardShortcuts";
import SteamBlockquote from "../extensions/steamBlockquote";
import SteamImage from "../extensions/steamImage";
import SteamImageInline from "../extensions/steamImageInline";
import ChapterTitle from "../extensions/chapterTitle";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";

export const createEditorExtensions = (options?: {
  reviewMode?: boolean;
  /** A4 全篇模式：追加 chapterTitle 节点扩展（章节边界标记） */
  wholeMode?: boolean;
}): Extensions => {
  const base: Extensions = [
    StarterKit.configure({
      heading: false,
      strike: false,
      horizontalRule: false,
      underline: false,
      link: false,
      blockquote: false
    }),
    Underline,
    Strike,
    Heading.configure({
      levels: [1, 2, 3]
    }),
    Link.extend({
      // 扩展 renderHTML 以添加 title 属性，悬停时显示链接地址
      renderHTML({ HTMLAttributes }) {
        return [
          "a",
          mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
            title: HTMLAttributes.href // 将 href 设为 title，悬停显示
          }),
          0
        ];
      }
    }).configure({
      openOnClick: false,
      linkOnPaste: true,
      autolink: true
    }),
    Spoiler,
    KeyboardShortcuts,
    HorizontalRule,
    Table.configure({
      resizable: false,
      HTMLAttributes: {
        class: "nasge-table"
      }
    }),
    TableRow,
    TableHeader,
    TableCell,
    SteamBlockquote
  ];

  // 评测模式不加载图片相关 extension
  if (!options?.reviewMode) {
    base.push(
      Image.configure({
        HTMLAttributes: {
          class: "nasge-image"
        }
      }),
      SteamImage,
      SteamImageInline
    );
  }

  // A4 全篇模式：追加 chapterTitle 节点（章节边界标记）
  if (options?.wholeMode) {
    base.push(ChapterTitle);
  }

  return base;
};

export const EMPTY_DOC: JSONContent = {
  type: "doc",
  content: [
    {
      type: "paragraph"
    }
  ]
};

export const createEmptyDoc = (): JSONContent =>
  JSON.parse(JSON.stringify(EMPTY_DOC));
