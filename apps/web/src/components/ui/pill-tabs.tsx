import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";

/**
 * Pill navigation from the prototype's project page (`.kb-tabs`): 40px pills on the card surface,
 * 4px apart; the active one fills with the secondary tone. Use for section navigation that maps
 * to routes or query parameters. Render a `PillTab` as a link with `render={<Link to=… />}`.
 * For in-page panels that are not navigation, use Tabs instead.
 */
function PillTabs({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      data-slot="pill-tabs"
      className={cn("flex gap-1 overflow-x-auto p-0.5 [scrollbar-width:none]", className)}
      {...props}
    />
  );
}

function PillTab({
  className,
  active = false,
  render,
  ...props
}: useRender.ComponentProps<"a"> & { active?: boolean }) {
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        "aria-current": active ? "page" : undefined,
        className: cn(
          "relative isolate inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-card px-4.5 text-sm font-medium whitespace-nowrap text-on-surface-variant no-underline transition-[border-radius] duration-[350ms] ease-spring-fast-spatial outline-none before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:bg-current before:opacity-0 before:transition-opacity before:duration-[140ms] before:content-[''] hover:before:opacity-8 focus-visible:ring-3 focus-visible:ring-ring/50 active:rounded-[10px] aria-[current=page]:bg-secondary-strong aria-[current=page]:text-on-secondary [&_svg]:size-4.5 [&_svg]:shrink-0",
          className,
        ),
      },
      props,
    ),
    render,
    state: { slot: "pill-tab", active },
  });
}

export { PillTabs, PillTab };
