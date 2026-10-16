import type { ReactNode } from "react";
import { useViewer } from "@/features/workspace/hooks/use-viewer";
import { NotFoundPage } from "@/pages/not-found-page";

/** Pages for owners only, who see everything. Renders nothing while the role is loading. */
export function OwnerOnly({ children }: { children: ReactNode }) {
  const { persona, seesEverything } = useViewer();
  if (!persona) return null;
  return seesEverything ? children : <NotFoundPage />;
}
