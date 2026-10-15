import type { ReactNode } from "react";
import { useViewer } from "@/features/workspace/hooks/use-viewer";
import { NotFoundPage } from "@/pages/not-found-page";

/** Tutorials are managed by admins and People Ops; the API refuses everyone else too. */
export function CuratorOnly({ children }: { children: ReactNode }) {
  const { persona } = useViewer();
  if (!persona) return null;
  return persona === "admin" || persona === "people_ops" ? children : <NotFoundPage />;
}
