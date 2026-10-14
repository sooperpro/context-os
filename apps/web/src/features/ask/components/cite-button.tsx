/** A numbered citation inside answer text: `[2]` → a small button that opens or shows source 2. */
export function CiteButton({
  n,
  title,
  onClick,
}: {
  n: number;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="mx-px inline-grid h-4.5 min-w-4.5 place-items-center rounded-xs bg-ai-container px-1 align-text-bottom font-mono text-[11px] font-semibold text-on-ai-container transition-colors outline-none hover:bg-ai hover:text-on-ai focus-visible:ring-3 focus-visible:ring-ring/50"
      onClick={onClick}
      aria-label={`Open source ${n}: ${title}`}
    >
      {n}
    </button>
  );
}
