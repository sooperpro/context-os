import { toast } from "sonner";

/**
 * A snackbar with Undo (prototype update, Oct 14): it stays until it is dismissed or replaced by
 * the next one, so nobody runs out of time to undo (WCAG 2.2.1). Plain confirmations still clear
 * on their own.
 */
export function toastWithUndo(message: string, onUndo: () => void) {
  return toast(message, {
    id: "undo",
    duration: Number.POSITIVE_INFINITY,
    closeButton: true,
    action: { label: "Undo", onClick: onUndo },
  });
}
