import { cn } from "cn";
import type { ComponentProps } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/*
 * AI-written text (tutorial lessons, Context Bot answers, overviews) as formatted text. GitHub-
 * flavoured Markdown: headings, lists, tables, task lists, quotes and code. Raw HTML is never
 * rendered, and react-markdown drops unsafe link protocols, so model output can't inject markup.
 */

const components: Components = {
  h1: ({ children }) => (
    <h2 className="mt-8 mb-3 font-heading text-2xl leading-8 font-medium text-balance first:mt-0">
      {children}
    </h2>
  ),
  h2: ({ children }) => (
    <h2 className="mt-8 mb-2.5 font-heading text-xl leading-7 font-medium text-balance first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-6 mb-2 text-base leading-6 font-semibold first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-5 mb-1.5 text-sm leading-5 font-semibold first:mt-0">{children}</h4>
  ),
  p: ({ children }) => <p className="my-3 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children, className }) => (
    <ul
      className={cn(
        "my-3 flex flex-col gap-1.5 ps-5.5 marker:text-primary",
        className?.includes("contains-task-list") ? "list-none ps-0" : "list-disc",
      )}
    >
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-3 flex list-decimal flex-col gap-1.5 ps-5.5 marker:text-primary">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="ps-0.5 [&>ol]:my-1.5 [&>ul]:my-1.5">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="font-medium text-primary underline underline-offset-2 hover:no-underline"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-4 rounded-r-md border-s-4 border-primary bg-primary-container/40 px-4 py-2.5 text-on-surface [&>p]:my-1">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-6 border-outline-variant" />,
  code: ({ children, className }) =>
    className?.startsWith("language-") ? (
      <code className={cn("font-mono text-[13px] leading-5", className)}>{children}</code>
    ) : (
      <code className="rounded-[6px] bg-surface-container-high px-1.5 py-px font-mono text-[0.9em]">
        {children}
      </code>
    ),
  pre: ({ children }) => (
    <pre className="my-4 overflow-x-auto rounded-md bg-surface-container-high p-4">{children}</pre>
  ),
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-md border border-outline-variant">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-surface-container">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-outline-variant px-3 py-2 text-start font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-outline-variant px-3 py-2 align-top last:border-b-0">
      {children}
    </td>
  ),
  input: (props: ComponentProps<"input">) => (
    <input {...props} disabled className="me-2 size-3.5 translate-y-px accent-primary" />
  ),
  img: () => null,
};

export function Markdown({
  text,
  className,
  overrides,
}: {
  text: string;
  className?: string;
  /** Replace how some elements render (e.g. citation links in answers). */
  overrides?: Partial<Components>;
}) {
  return (
    <div className={cn("min-w-0 break-words", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={overrides ? { ...components, ...overrides } : components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
