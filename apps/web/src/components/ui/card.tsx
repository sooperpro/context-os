import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import * as React from "react";

/**
 * Card surface. `tone` gives the prototype's tonal cards (primary, secondary, AI); `interactive`
 * adds the hover state layer and the corner morph of a card that is a link or a button.
 */
const cardVariants = cva(
  "group/card relative isolate flex min-w-0 flex-col gap-4 overflow-hidden rounded-card py-(--card-spacing) text-sm [--card-spacing:--spacing(6)] has-[>img:first-child]:pt-0 data-[size=sm]:gap-3 data-[size=sm]:[--card-spacing:--spacing(4)] *:[img:first-child]:rounded-t-card *:[img:last-child]:rounded-b-card",
  {
    variants: {
      tone: {
        default: "bg-card text-card-foreground",
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
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
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
        "font-heading text-xl leading-7 font-medium group-data-[size=sm]/card:text-base",
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
        "flex flex-wrap items-center gap-2 px-(--card-spacing)",
        className,
      )}
      {...props}
    />
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent, cardVariants };
