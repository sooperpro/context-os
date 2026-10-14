import { createContext, useContext } from "react";

export type AssistantQueryHandler = (query: string) => void;

export interface AssistantContextValue {
  open: boolean;
  /** Open the pane; with `query`, hand that text to the panel (search submit, "Ask about this…"). */
  openAssistant: (query?: string) => void;
  closeAssistant: () => void;
  toggleAssistant: () => void;
  /** The panel subscribes to handed-over queries. A query sent before any subscriber is kept for the first one. */
  subscribeToQueries: (handler: AssistantQueryHandler) => () => void;
}

export const AssistantContext = createContext<AssistantContextValue | null>(null);

export function useAssistant(): AssistantContextValue {
  const context = useContext(AssistantContext);
  if (!context) throw new Error("useAssistant must be used within <AppShell>");
  return context;
}
