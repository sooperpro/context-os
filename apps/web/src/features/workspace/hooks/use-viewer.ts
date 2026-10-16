import type { SystemRole } from "@contextos/shared";
import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { currentWorkspaceQuery } from "@/features/workspace/api/workspace.queries";
import {
  getPreviewPersona,
  personaForRole,
  PERSONA_ROLE,
  subscribePreviewPersona,
  type Persona,
} from "@/features/workspace/viewer";

export interface Viewer {
  /** The role the UI renders and gates on: the real role, or the previewed persona's in development. */
  role: SystemRole | undefined;
  /** The role the API enforces. */
  actualRole: SystemRole | undefined;
  /** Whose Home and rail to show. */
  persona: Persona | undefined;
  /** Development only: the persona being previewed, or null when showing the real role. */
  preview: Persona | null;
  /**
   * Owners see everything (decided 16 Oct 2026): People Ops pages with HR's powers, the full
   * directory, members' Context Bot conversations and every source.
   */
  seesEverything: boolean;
}

/**
 * Who the UI is rendered for. Every role check in the UI reads this, never the workspace role
 * directly, so the development "Preview as" switches the whole app at once.
 */
export function useViewer(): Viewer {
  const workspace = useQuery(currentWorkspaceQuery());
  const preview = useSyncExternalStore(subscribePreviewPersona, getPreviewPersona, () => null);
  const actualRole = workspace.data?.role;
  const role = preview ? PERSONA_ROLE[preview] : actualRole;
  return {
    role,
    actualRole,
    persona: preview ?? (actualRole ? personaForRole(actualRole) : undefined),
    preview,
    seesEverything: role === "owner",
  };
}
