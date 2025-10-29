import Blockquote from "@tiptap/extension-blockquote";

const SteamBlockquote = Blockquote.extend({
  addAttributes() {
    return {
      author: {
        default: "",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-author") || "",
        renderHTML: (attributes: { author?: string }) => {
          return {
            "data-author": attributes.author || null,
            class: "nasge-quote"
          };
        }
      }
    };
  }
});

export default SteamBlockquote;
