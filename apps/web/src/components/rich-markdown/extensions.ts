import type { Editor, Extensions } from "@tiptap/react";
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

/** A draft's "[S3]" or "[S1, S4]" citation markers, which the Markdown writer escapes as "\[S3\]". */
const ESCAPED_CITATION = /\\\[(S\d+(?:\s*[,;]\s*S?\d+)*)\\\](?!\()/g;

/** The editor's Markdown, with citation markers left as the draft wrote them. */
export const lessonMarkdown = (editor: Pick<Editor, "getMarkdown">) =>
  editor.getMarkdown().replace(ESCAPED_CITATION, "[$1]");
