import { useId } from "react";
import { useAssistant } from "@/components/layout/assistant-context";
import { Card } from "@/components/ui/card";
import { BotGlyph } from "@/components/ui/bot-glyph";
import { Chip } from "@/components/ui/chip";
import { NorthEastIcon } from "@/components/ui/icons";

/**
 * A side card of questions for Context Bot about what is on the page (prototype `.ask-card`):
 * "Ask about this review" with suggested questions that open the assistant pane.
 */
export function AskCard({ title, prompts }: { title: string; prompts: readonly string[] }) {
  const { openAssistant } = useAssistant();
  const headingId = useId();
  return (
    <Card role="region" aria-labelledby={headingId} className="gap-3 px-6">
      <div className="flex items-center gap-3">
        <BotGlyph size="sm" />
        <h2 id={headingId} className="font-heading text-base font-medium">
          {title}
        </h2>
      </div>
      <div className="flex flex-col items-start gap-2">
        {prompts.map((prompt) => (
          <Chip
            key={prompt}
            variant="ai"
            className="h-auto min-h-8 py-1.5 text-start whitespace-normal"
            onClick={() => openAssistant(prompt)}
          >
            <NorthEastIcon aria-hidden />
            {prompt}
          </Chip>
        ))}
      </div>
    </Card>
  );
}
