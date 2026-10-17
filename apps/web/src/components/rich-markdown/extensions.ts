import type { Extensions } from "@tiptap/react";
import { TableKit } from "@tiptap/extension-table";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";

/**
 * What the visual lesson editor understands: the GitHub-flavoured Markdown that lessons are stored
 * in (headings, lists, quotes, code, links, tables). The editor reads and writes Markdown, so
 * stored lessons, AI drafts and the learner view don't change.
 */
export function lessonExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3, 4] },
      link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      underline: false,
    }),
    TableKit.configure({ table: { resizable: false } }),
    Markdown,
  ];
}
