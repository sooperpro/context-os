import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import * as React from "react";

/**
 * Card surface. `tone` gives the prototype's tonal cards (primary, secondary, AI); `interactive`
 * adds the hover state layer and the corner morph of a card that is a link or a button.
 */
const cardVariants = cva(
  "group/card relative isolate flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl py-(--card-spacing) text-sm [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
  {
    variants: {
      tone: {
        default: "bg-card text-card-foreground ring-1 ring-foreground/10",
        primary: "bg-primary-container text-on-primary-container",
        secondary: "bg-secondary-container text-on-secondary-container",
        ai: "bg-ai-container/60 text-on-ai-container",
        outlined: "bg-transparent text-card-foreground ring-1 ring-outline-variant",
        pane: "bg-pane text-card-foreground",
      },
      interactive: {
        true: "transition-[border-radius] duration-[350ms] ease-spring-fast-spatial before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:bg-current before:opacity-0 before:transition-opacity before:duration-[140ms] before:content-[''] hover:rounded-3xl hover:before:opacity-5 focus-within:before:opacity-8",
        false: "",
      },
    },
    defaultVariants: { tone: "default", interactive: false },
  },
);

function Card({
  className,
  size = "default",
  tone = "default",
  interactive = false,
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" } & VariantProps<typeof cardVariants>) {
  return (
    <div
      data-slot="card"
      data-size={size}
      data-tone={tone}
      className={cn(cardVariants({ tone, interactive }), className)}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm",
        className,
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground group-not-data-[tone=default]/card:text-current group-not-data-[tone=default]/card:opacity-90", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-content" className={cn("px-(--card-spacing)", className)} {...props} />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-xl border-t bg-muted/50 p-(--card-spacing)",
        className,
      )}
      {...props}
    />
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent, cardVariants };
