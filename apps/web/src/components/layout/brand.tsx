import { cn } from "cn";
import { SparklesIcon } from "lucide-react";
import { Link } from "react-router";

/** Wordmark with the AI-teal brand mark. `compact` shows the mark only. */
export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <Link
      to="/"
      aria-label="ContextOS home"
      className={cn("flex items-center gap-2 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50", className)}
    >
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-[30%] bg-ai-container text-on-ai-container"
      >
        <SparklesIcon className="size-5" />
      </span>
      {compact ? null : (
        <span className="font-heading text-lg font-semibold tracking-tight">
          Context<b className="font-bold">OS</b>
        </span>
      )}
    </Link>
  );
}
