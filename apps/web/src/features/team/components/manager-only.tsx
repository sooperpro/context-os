import type { ReactNode } from "react";
import { useViewer } from "@/features/workspace/hooks/use-viewer";
import type { Persona } from "@/features/workspace/viewer";
import { NotFoundPage } from "@/pages/not-found-page";

/**
 * Manager pages are for managers (role access spec §4.6). Everyone else gets the not found page, as
 * the API refuses them too. `alsoFor` lets another persona in, such as People Ops on member pages.
 * Renders nothing while the role is loading.
 */
export function ManagerOnly({
  children,
  alsoFor = [],
}: {
  children: ReactNode;
  alsoFor?: readonly Persona[];
}) {
  const { persona } = useViewer();
  if (!persona) return null;
  return persona === "manager" || alsoFor.includes(persona) ? children : <NotFoundPage />;
}
