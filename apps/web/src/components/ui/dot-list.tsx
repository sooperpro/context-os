import type { ReactNode } from "react";

/** Facts joined by the prototype's small dot separator (`.item-meta .sep`). Empty parts are skipped. */
function DotList({ parts }: { parts: readonly ReactNode[] }) {
  const shown = parts.filter(
    (part) => part !== null && part !== undefined && part !== false && part !== "",
  );
  return (
    <>
      {shown.map((part, index) => (
        // Parts are positional facts with no identity of their own, so the index is the key.
        <span key={index} className="inline-flex items-center gap-2">
          {index > 0 ? (
            <span aria-hidden className="size-0.75 rounded-full bg-current opacity-60" />
          ) : null}
          {part}
        </span>
      ))}
    </>
  );
}

export { DotList };
