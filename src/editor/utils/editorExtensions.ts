import { Extensions, JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Strike from "@tiptap/extension-strike";
import Heading from "@tiptap/extension-heading";
import Link from "@tiptap/extension-link";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import Image from "@tiptap/extension-image";

import Spoiler from "../extensions/spoiler";
import SteamBlockquote from "../extensions/steamBlockquote";
import SteamImage from "../extensions/steamImage";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";

export const createEditorExtensions = (): Extensions => [
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
  Link.configure({
    openOnClick: false,
    linkOnPaste: true,
    autolink: true
  }),
  Spoiler,
  HorizontalRule,
  Image.configure({
    HTMLAttributes: {
      class: "nasge-image"
    }
  }),
  SteamImage,
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
