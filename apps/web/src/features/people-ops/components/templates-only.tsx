import type { ReactNode } from "react";
import { useIsCurator } from "@/features/tutorials/use-is-curator";
import { useViewer } from "@/features/workspace/hooks/use-viewer";
import { NotFoundPage } from "@/pages/not-found-page";

/**
 * Templates are managed by People Ops, admins and owners; managers and path curators draft their
 * own and submit them for review (N-18). Everyone else gets the not found page, as the API refuses
 * them too. Renders nothing while the role is loading.
 */
export function TemplatesOnly({ children }: { children: ReactNode }) {
  const { persona, seesEverything } = useViewer();
  const curator = useIsCurator();
  if (!persona) return null;
  return persona === "people_ops" ||
    persona === "admin" ||
    persona === "manager" ||
    seesEverything ||
    curator ? (
    children
  ) : (
    <NotFoundPage />
  );
}
