import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";

/**
 * M3 Expressive connected button group (segmented filter). Buttons sit 2px apart with 8px inner
 * corners; the ends are pill-shaped; the pressed button turns fully round and fills with the
 * secondary tone. Mark the active one with `pressed`.
 */
function ConnectedButtonGroup({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "sm" | "default" }) {
  return (
    <div
      role="group"
      data-slot="connected-button-group"
      data-size={size}
      className={cn("group/cbg inline-flex gap-0.5", className)}
      {...props}
    />
  );
}

function ConnectedButton({
  className,
  pressed = false,
  render,
  ...props
}: useRender.ComponentProps<"button"> & { pressed?: boolean }) {
  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        type: "button",
        "aria-pressed": pressed,
        className: cn(
          "inline-flex h-10 items-center gap-1.5 rounded-sm bg-surface-container-highest px-4 text-sm font-medium whitespace-nowrap text-on-surface-variant transition-[border-radius,background-color] duration-[350ms] ease-spring-fast-spatial outline-none select-none first:rounded-l-full last:rounded-r-full hover:bg-on-surface/8 focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:rounded-full aria-pressed:bg-secondary-strong aria-pressed:text-on-secondary group-data-[size=sm]/cbg:h-8 group-data-[size=sm]/cbg:px-3 group-data-[size=sm]/cbg:text-xs [&_svg]:size-4.5 [&_svg]:shrink-0",
          className,
        ),
      },
      props,
    ),
    render,
    state: { slot: "connected-button", pressed },
  });
}

export { ConnectedButtonGroup, ConnectedButton };
