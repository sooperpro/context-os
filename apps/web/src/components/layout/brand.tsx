import { cn } from "cn";
import { Link, useInRouterContext } from "react-router";
import { HubFilledIcon } from "@/components/ui/icons";

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
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-[30%] bg-ai-container text-on-ai-container"
      >
        <HubFilledIcon className="size-5" />
      </span>
      {compact ? null : (
        <span className="font-heading text-lg font-semibold tracking-tight">
          Context<b className="font-bold">OS</b>
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
