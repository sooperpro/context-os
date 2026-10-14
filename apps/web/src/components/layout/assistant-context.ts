import { createContext, useContext } from "react";

/** The prototype's Context Bot review states (View as menu, development only). */
export type BotDemoState = "welcome" | "thinking" | "answer" | "no_answer" | "restricted" | "error";

/** What the panel is handed: a question to ask, or a review state to show. */
export type AssistantRequest = { query: string } | { demo: BotDemoState };
export type AssistantRequestHandler = (request: AssistantRequest) => void;

export interface AssistantContextValue {
  open: boolean;
  /** The pane at its wide size (prototype "Expand panel"). */
  wide: boolean;
  /** Open the pane; with `query`, hand that text to the panel (search submit, "Ask about this…"). */
  openAssistant: (query?: string) => void;
  /** Open the pane in one of the prototype's review states. Development only. */
  showBotDemo: (state: BotDemoState) => void;
  closeAssistant: () => void;
  toggleAssistant: () => void;
  toggleWide: () => void;
  /** The panel subscribes to handed-over requests. One sent before any subscriber is kept for the first one. */
  subscribeToRequests: (handler: AssistantRequestHandler) => () => void;
}

export const AssistantContext = createContext<AssistantContextValue | null>(null);

export function useAssistant(): AssistantContextValue {
  const context = useContext(AssistantContext);
  if (!context) throw new Error("useAssistant must be used within <AppShell>");
  return context;
}
