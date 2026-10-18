import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { cn } from "cn";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CodeIcon,
  DeleteIcon,
  FormatBoldIcon,
  FormatH2Icon,
  FormatH3Icon,
  FormatItalicIcon,
  FormatListBulletedIcon,
  FormatListNumberedIcon,
  FormatQuoteIcon,
  HorizontalRuleIcon,
  LinkIcon,
  LinkOffIcon,
  RedoIcon,
  TableIcon,
  TableRowsIcon,
  UndoIcon,
  ViewColumnIcon,
} from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lessonExtensions, lessonMarkdown } from "./extensions";

/** The editing surface, styled like the learner view (components/markdown.tsx). */
const PROSE = cn(
  "min-h-48 rounded-b-2xl bg-pane px-5 py-4 text-[15px] leading-6 text-on-surface outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
  "[&_h2]:mt-8 [&_h2]:mb-2.5 [&_h2]:font-heading [&_h2]:text-xl [&_h2]:leading-7 [&_h2]:font-medium [&_h2:first-child]:mt-0",
  "[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:leading-6 [&_h3]:font-semibold [&_h3:first-child]:mt-0",
  "[&_h4]:mt-5 [&_h4]:mb-1.5 [&_h4]:text-sm [&_h4]:font-semibold",
  "[&_p]:my-3 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
  "[&_li]:my-1 [&_li]:ps-0.5 [&_li]:marker:text-primary [&_li>p]:my-0 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:ps-5.5 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:ps-5.5",
  "[&_em]:italic [&_strong]:font-semibold",
  "[&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
  "[&_blockquote]:my-4 [&_blockquote]:rounded-r-md [&_blockquote]:border-s-4 [&_blockquote]:border-primary [&_blockquote]:bg-primary-container/40 [&_blockquote]:px-4 [&_blockquote]:py-2.5",
  "[&_hr]:my-6 [&_hr]:border-outline-variant",
  "[&_code]:rounded-[6px] [&_code]:bg-surface-container-high [&_code]:px-1.5 [&_code]:py-px [&_code]:font-mono [&_code]:text-[0.9em]",
  "[&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-surface-container-high [&_pre]:p-4 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[13px]",
  "[&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm",
  "[&_th]:border [&_th]:border-outline-variant [&_th]:bg-surface-container [&_th]:px-3 [&_th]:py-2 [&_th]:text-start [&_th]:font-semibold",
  "[&_td]:border [&_td]:border-outline-variant [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_td>p]:my-0 [&_th>p]:my-0",
  "[&_.selectedCell]:bg-primary-container/40",
);

/**
 * The visual editor for a lesson (N-18 follow-up): what you see is what learners read. It reads
 * and writes the same GitHub-flavoured Markdown lessons are stored in, and reports a change only
 * when the text is edited, so opening a lesson never creates unpublished changes.
 */
export default function RichMarkdownEditor({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const changed = useRef(onChange);
  useEffect(() => {
    changed.current = onChange;
  });
  // The Markdown this editor last produced, so the parent's echo of it doesn't reset the cursor.
  const last = useRef(value);
  const editor = useEditor({
    extensions: lessonExtensions(),
    content: value,
    contentType: "markdown",
    editorProps: {
      attributes: {
        id,
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
        class: PROSE,
      },
    },
    onUpdate: ({ editor: current }) => {
      const markdown = lessonMarkdown(current);
      last.current = markdown;
      changed.current(markdown);
    },
  });

  // A new draft or a discarded edit replaces the text from outside.
  useEffect(() => {
    if (value === last.current) return;
    last.current = value;
    editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
  }, [editor, value]);

  return (
    <div className="flex flex-col">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      h2: current.isActive("heading", { level: 2 }),
      h3: current.isActive("heading", { level: 3 }),
      bullets: current.isActive("bulletList"),
      numbers: current.isActive("orderedList"),
      quote: current.isActive("blockquote"),
      code: current.isActive("code"),
      link: current.isActive("link"),
      table: current.isActive("table"),
      canUndo: current.can().undo(),
      canRedo: current.can().redo(),
    }),
  });
  const [linking, setLinking] = useState(false);
  const chain = () => editor.chain().focus();
  const tool = (
    name: string,
    icon: React.ReactNode,
    run: () => void,
    { pressed, disabled = false }: { pressed?: boolean; disabled?: boolean } = {},
  ) => (
    <Button
      key={name}
      type="button"
      size="icon-sm"
      variant="ghost"
      aria-label={name}
      title={name}
      {...(pressed === undefined ? {} : { "aria-pressed": pressed })}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={run}
    >
      {icon}
    </Button>
  );
  const divider = (key: string) => (
    <span key={key} aria-hidden className="mx-1 h-5 w-px bg-outline-variant" />
  );

  return (
    <div className="flex flex-col rounded-t-2xl bg-surface-container-high">
      <div
        role="toolbar"
        aria-label="Formatting"
        className="flex flex-wrap items-center gap-0.5 p-1.5"
      >
        {tool("Heading", <FormatH2Icon />, () => chain().toggleHeading({ level: 2 }).run(), {
          pressed: state.h2,
        })}
        {tool("Subheading", <FormatH3Icon />, () => chain().toggleHeading({ level: 3 }).run(), {
          pressed: state.h3,
        })}
        {divider("d1")}
        {tool("Bold", <FormatBoldIcon />, () => chain().toggleBold().run(), {
          pressed: state.bold,
        })}
        {tool("Italic", <FormatItalicIcon />, () => chain().toggleItalic().run(), {
          pressed: state.italic,
        })}
        {tool("Code", <CodeIcon />, () => chain().toggleCode().run(), { pressed: state.code })}
        {state.link
          ? tool("Remove link", <LinkOffIcon />, () => chain().unsetLink().run())
          : tool("Link", <LinkIcon />, () => setLinking(true))}
        {divider("d2")}
        {tool("Bulleted list", <FormatListBulletedIcon />, () => chain().toggleBulletList().run(), {
          pressed: state.bullets,
        })}
        {tool(
          "Numbered list",
          <FormatListNumberedIcon />,
          () => chain().toggleOrderedList().run(),
          { pressed: state.numbers },
        )}
        {tool("Quote", <FormatQuoteIcon />, () => chain().toggleBlockquote().run(), {
          pressed: state.quote,
        })}
        {tool("Divider", <HorizontalRuleIcon />, () => chain().setHorizontalRule().run())}
        {tool("Table", <TableIcon />, () =>
          chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
        )}
        {divider("d3")}
        {tool("Undo", <UndoIcon />, () => chain().undo().run(), { disabled: !state.canUndo })}
        {tool("Redo", <RedoIcon />, () => chain().redo().run(), { disabled: !state.canRedo })}
      </div>
      {state.table ? (
        <div
          role="toolbar"
          aria-label="Table"
          className="flex flex-wrap items-center gap-1 border-t border-outline-variant px-2 py-1.5 text-xs"
        >
          <span className="me-1 text-on-surface-variant">Table:</span>
          <TableAction icon={<TableRowsIcon />} onClick={() => chain().addRowAfter().run()}>
            Add row
          </TableAction>
          <TableAction icon={<ViewColumnIcon />} onClick={() => chain().addColumnAfter().run()}>
            Add column
          </TableAction>
          <TableAction icon={<DeleteIcon />} onClick={() => chain().deleteRow().run()}>
            Delete row
          </TableAction>
          <TableAction icon={<DeleteIcon />} onClick={() => chain().deleteColumn().run()}>
            Delete column
          </TableAction>
          <TableAction icon={<DeleteIcon />} onClick={() => chain().deleteTable().run()}>
            Delete table
          </TableAction>
        </div>
      ) : null}
      <LinkDialog
        open={linking}
        initial={(editor.getAttributes("link").href as string | undefined) ?? ""}
        onClose={() => setLinking(false)}
        onSave={(href) => {
          setLinking(false);
          if (href) chain().extendMarkRange("link").setLink({ href }).run();
        }}
      />
    </div>
  );
}

function TableAction({
  icon,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="xs"
      variant="ghost"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {icon} {children}
    </Button>
  );
}

function LinkDialog({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: string;
  onClose: () => void;
  onSave: (href: string) => void;
}) {
  const id = useId();
  const [href, setHref] = useState(initial);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setHref(initial);
        else onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(href.trim());
          }}
        >
          <DialogHeader>
            <DialogTitle>Add a link</DialogTitle>
            <DialogDescription>Select the text first; the link goes on it.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id}>Web address</Label>
            <Input
              id={id}
              type="url"
              value={href}
              placeholder="https://"
              onChange={(event) => setHref(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!href.trim()}>
              Add link
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
