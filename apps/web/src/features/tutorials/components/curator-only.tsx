import type { ReactNode } from "react";
import { useIsCurator } from "@/features/tutorials/use-is-curator";
import { useViewer } from "@/features/workspace/hooks/use-viewer";
import { NotFoundPage } from "@/pages/not-found-page";

/**
 * Tutorials are managed by admins, People Ops and path curators (for their projects). Managers open
 * the module drafts a roadmap generator made for them (N-18); the API refuses everyone else too.
 */
export function CuratorOnly({ children }: { children: ReactNode }) {
  const { persona } = useViewer();
  const curator = useIsCurator();
  if (!persona) return null;
  return persona === "admin" || persona === "people_ops" || persona === "manager" || curator ? (
    children
  ) : (
    <NotFoundPage />
  );
}
