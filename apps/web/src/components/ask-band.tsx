import { cn } from "cn";
import { useId, useState } from "react";
import { useAssistant } from "@/components/layout/assistant-context";
import { BotGlyph } from "@/components/ui/bot-glyph";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { ArrowUpwardIcon, ManageSearchIcon, NorthEastIcon } from "@/components/ui/icons";

interface AskBandProps {
  title?: string;
  description?: string;
  placeholder?: string;
  /** Suggested questions, shown as chips that ask on click. */
  prompts?: readonly string[];
  className?: string;
}

/**
 * The prototype's ask band: a full-width Context Bot entry point with a question field and
 * suggestions. Submitting hands the question to the Context Bot pane.
 */
export function AskBand({
  title = "Stuck on something? Ask Context Bot",
  description = "Answers come from the docs, decisions and conversations you can access, with the sources cited.",
  placeholder = "Ask about a product, project, system or person…",
  prompts = [],
  className,
}: AskBandProps) {
  const { openAssistant } = useAssistant();
  const [question, setQuestion] = useState("");
  const headingId = useId();
  const inputId = useId();

  const ask = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    openAssistant(trimmed);
    setQuestion("");
  };

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "grid grid-cols-1 items-center gap-x-6 gap-y-4 rounded-2xl bg-ai-container/42 px-5 py-5 text-on-ai-container medium:rounded-3xl medium:px-7 medium:py-6 @min-[940px]:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]",
        className,
      )}
    >
      <div className="flex items-center gap-4">
        <BotGlyph
          size="lg"
          spin
          className="[&_[data-slot=shape]]:text-ai [&_svg[data-icon]]:text-on-ai"
        />
        <div>
          <h2
            id={headingId}
            className="font-heading text-xl leading-7 font-semibold text-on-surface"
          >
            {title}
          </h2>
          <p className="mt-0.5 text-sm">{description}</p>
        </div>
      </div>
      <form
        role="search"
        className="flex h-14 items-center gap-2 rounded-full bg-pane pr-2 pl-4.5 text-ai shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-ai)_25%,transparent)] transition-shadow focus-within:shadow-[inset_0_0_0_2px_var(--color-ai)]"
        onSubmit={(event) => {
          event.preventDefault();
          ask(question);
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Ask Context Bot
        </label>
        <ManageSearchIcon className="size-6 shrink-0" aria-hidden />
        <input
          id={inputId}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="h-full min-w-0 flex-1 bg-transparent text-base text-on-surface outline-none placeholder:text-on-surface-variant"
        />
        <kbd className="hidden rounded-sm bg-surface-container-high px-1.5 py-0.5 font-sans text-xs text-on-surface-variant medium:inline">
          ⌘J
        </kbd>
        <Button type="submit" variant="ai" size="icon" className="rounded-full" aria-label="Ask">
          <ArrowUpwardIcon />
        </Button>
      </form>
      {prompts.length > 0 ? (
        <div className="-mx-5 flex [scrollbar-width:none] gap-2 overflow-x-auto px-5 pb-0.5 medium:mx-0 medium:flex-wrap medium:px-0 @min-[940px]:col-span-2">
          {prompts.map((prompt) => (
            <Chip key={prompt} variant="ai" onClick={() => ask(prompt)}>
              <NorthEastIcon aria-hidden />
              {prompt}
            </Chip>
          ))}
        </div>
      ) : null}
    </section>
  );
}
