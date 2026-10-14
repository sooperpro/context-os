import { cn } from "cn";
import { CheckIcon } from "@/components/ui/icons";

/** The numbered circle before a lesson (prototype `.ls-num`): a check when done, filled when current. */
export function LessonNumber({
  number,
  done,
  current,
}: {
  number: number;
  done: boolean;
  current: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-full text-xs font-medium text-on-surface-variant shadow-[inset_0_0_0_1.5px_var(--color-outline-variant)] [&_svg]:size-3.5",
        done && "bg-success-container text-on-success-container shadow-none",
        current && !done && "bg-primary text-primary-foreground shadow-none",
      )}
    >
      {done ? <CheckIcon /> : number}
    </span>
  );
}
