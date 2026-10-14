import { AppShell } from "@/components/layout/app-shell";
import { AssistantPanel } from "@/features/ask/components/assistant-panel";

/** Composes the generic shell with the feature that fills its assistant pane. */
export function RootLayout() {
  return <AppShell assistant={<AssistantPanel />} />;
}
