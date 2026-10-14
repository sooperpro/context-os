import { cn } from "cn";
import { Link, useInRouterContext } from "react-router";
import { Shape } from "@/components/ui/shape";

/**
 * Wordmark with the AI-teal brand mark. `compact` shows the mark only.
 * Renders a router link inside the app and a plain anchor outside it (the sign-in frame mounts
 * before the router).
 */
export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  const inRouter = useInRouterContext();
  const linkProps = {
    "aria-label": "ContextOS home",
    className: cn("flex items-center gap-2 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50", className),
  };
  const content = (
    <>
      {/* Prototype brand mark: a primary clover with the AI-teal dot at its center. */}
      <span aria-hidden className="relative grid size-8 shrink-0 place-items-center">
        <Shape kind="clover4" className="col-start-1 row-start-1 size-8 text-primary" />
        <span className="col-start-1 row-start-1 size-2.5 rounded-full bg-ai" />
      </span>
      {compact ? null : (
        <span className="font-heading text-xl leading-none font-semibold tracking-tight whitespace-nowrap">
          Context<b className="font-semibold text-primary">OS</b>
        </span>
      )}
    </>
  );
  return inRouter ? (
    <Link to="/" {...linkProps}>
      {content}
    </Link>
  ) : (
    <a href="/" {...linkProps}>
      {content}
    </a>
  );
}
