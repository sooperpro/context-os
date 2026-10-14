import { cn } from "cn";

/**
 * The prototype's two-column page body (`.learn-grid`): a main column and a narrower side column
 * (2 : 1, side at least 280px), stacking below 940px of content width. Used by learning,
 * contributions and detail pages.
 */
export function PageColumns({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 items-start gap-3 medium:gap-4 @min-[940px]:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]",
        className,
      )}
      {...props}
    />
  );
}

export function PageMain({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex min-w-0 flex-col gap-3 medium:gap-4", className)} {...props} />;
}

export function PageSide({ className, ...props }: React.ComponentProps<"aside">) {
  return <aside className={cn("flex min-w-0 flex-col gap-3 medium:gap-4", className)} {...props} />;
}
