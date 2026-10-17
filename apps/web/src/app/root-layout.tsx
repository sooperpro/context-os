import { AppShell } from "@/components/layout/app-shell";
import { AssistantPanel } from "@/features/ask/components/assistant-panel";
import { useSetupRedirect } from "@/features/setup/hooks/use-setup-redirect";
import { useFirstDayRedirect } from "@/features/welcome/hooks/use-first-day-redirect";

/** Composes the generic shell with the feature that fills its assistant pane. */
export function RootLayout() {
  useFirstDayRedirect();
  useSetupRedirect();
  return <AppShell assistant={<AssistantPanel />} />;
}
