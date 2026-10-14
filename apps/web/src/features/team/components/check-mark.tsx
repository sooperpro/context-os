import type { CheckCell } from "@contextos/shared";
import { cn } from "cn";
import { CHECK_CELL_LABEL } from "@/features/team/team-meta";
import { CancelFilledIcon, CheckCircleFilledIcon, RadioButtonUncheckedIcon, RemoveIcon } from "@/components/ui/icons";


/** A knowledge check result (prototype `.mx`): passed, failed, not yet, or not in the plan. */
export function CheckMark({ state, size = "default", label }: { state: CheckCell; size?: "sm" | "default"; label?: string }) {
  const Icon = state === "pass" ? CheckCircleFilledIcon : state === "fail" ? CancelFilledIcon : state === "todo" ? RadioButtonUncheckedIcon : RemoveIcon;
  return (
    <span
      title={CHECK_CELL_LABEL[state]}
      className={cn(
        "inline-grid shrink-0 place-items-center",
        size === "sm" ? "size-5 rounded-[6px] [&_svg]:size-4" : "size-8 rounded-[10px] [&_svg]:size-5",
        state === "pass" && "text-success",
        state === "fail" && "bg-error-container text-error",
        (state === "todo" || state === "na") && "text-outline",
      )}
    >
      <Icon aria-hidden />
      <span className="sr-only">{label ? `${label}: ${CHECK_CELL_LABEL[state]}` : CHECK_CELL_LABEL[state]}</span>
    </span>
  );
}
