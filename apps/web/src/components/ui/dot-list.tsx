import type { ReactNode } from "react";

/**
 * Facts joined by the prototype's small dot separator (`.item-meta .sep`). Empty parts are skipped.
 * It spaces itself, so it reads the same inside a flex row, a table cell or running text.
 */
function DotList({ parts }: { parts: readonly ReactNode[] }) {
  const shown = parts.filter(
    (part) => part !== null && part !== undefined && part !== false && part !== "",
  );
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {shown.map((part, index) => (
        // Parts are positional facts with no identity of their own, so the index is the key.
        <span key={index} className="inline-flex items-center gap-2">
          {index > 0 ? (
            <span aria-hidden className="size-0.75 shrink-0 rounded-full bg-current opacity-60" />
          ) : null}
          {part}
        </span>
      ))}
    </span>
  );
}

export { DotList };
