import { useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useAssistant } from "@/components/layout/assistant-context";
import { HubFilledIcon } from "@/components/ui/icons";

/**
 * "Select text → Ask Context Bot" (prototype `.sel-ask`): when text inside `containerRef` is
 * selected, a floating button above it hands the passage to Context Bot.
 */
export function SelectionAsk({ containerRef }: { containerRef: RefObject<HTMLElement | null> }) {
  const { openAssistant } = useAssistant();
  const [selection, setSelection] = useState<{ text: string; x: number; y: number } | null>(null);

  useEffect(() => {
    const update = () => {
      const current = window.getSelection();
      const container = containerRef.current;
      const text = current?.toString().trim().replace(/\s+/g, " ") ?? "";
      if (
        !current ||
        !container ||
        current.rangeCount === 0 ||
        text.length < 3 ||
        text.length > 280 ||
        !current.anchorNode ||
        !container.contains(current.anchorNode)
      ) {
        setSelection(null);
        return;
      }
      const rect = current.getRangeAt(0).getBoundingClientRect();
      setSelection({
        text: text.length > 120 ? `${text.slice(0, 117)}…` : text,
        x: Math.min(Math.max(rect.left + rect.width / 2, 96), window.innerWidth - 96),
        y: Math.max(8, rect.top - 48),
      });
    };
    const onMouseUp = () => window.setTimeout(update, 0);
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.shiftKey) update();
    };
    const hide = () => setSelection(null);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keyup", onKeyUp);
    document.addEventListener("scroll", hide, true);
    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("scroll", hide, true);
    };
  }, [containerRef]);

  if (!selection) return null;
  return createPortal(
    <button
      type="button"
      style={{ left: selection.x, top: selection.y }}
      className="fixed z-50 inline-flex h-9 -translate-x-1/2 items-center gap-1.5 rounded-full bg-ai pr-3.5 pl-2.5 text-sm font-medium text-on-ai shadow-elevation-2 [&_svg]:size-5"
      // Keep the selection while the button is pressed.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        openAssistant(`Explain this: “${selection.text}”`);
        window.getSelection()?.removeAllRanges();
        setSelection(null);
      }}
    >
      <HubFilledIcon aria-hidden /> Ask Context Bot
    </button>,
    document.body,
  );
}
