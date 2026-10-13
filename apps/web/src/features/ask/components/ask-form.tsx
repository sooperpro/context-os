import { SendIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

interface AskFormProps {
  isPending: boolean;
  onSubmit: (question: string) => void;
}

const SUGGESTIONS = [
  "Why was this approach chosen?",
  "What is currently blocked?",
  "Who owns which area?",
  "What changed recently and why?",
];

export function AskForm({ isPending, onSubmit }: AskFormProps) {
  const [question, setQuestion] = useState("");
  const trimmed = question.trim();
  const canSubmit = trimmed.length >= 3 && !isPending;

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSubmit) return;
    onSubmit(trimmed);
    setQuestion("");
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Textarea
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit();
        }}
        rows={3}
        placeholder="Ask about this project's history, decisions, ownership or current state…"
        aria-label="Question"
        disabled={isPending}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((suggestion) => (
            <Button
              key={suggestion}
              type="button"
              variant="outline"
              size="xs"
              disabled={isPending}
              onClick={() => setQuestion(suggestion)}
            >
              {suggestion}
            </Button>
          ))}
        </div>
        <Button type="submit" disabled={!canSubmit}>
          {isPending ? <Spinner /> : <SendIcon aria-hidden />}
          {isPending ? "Searching evidence…" : "Ask"}
        </Button>
      </div>
    </form>
  );
}
