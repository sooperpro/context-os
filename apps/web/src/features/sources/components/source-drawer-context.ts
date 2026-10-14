import { createContext } from "react";

export interface SourceDrawerTarget {
  sourceId: string;
  /** Evidence record to load when the caller has one; this preserves the exact source context. */
  evidenceId?: string;
  /** Evidence quote to surface at the top of the drawer. */
  quote?: string;
}

export interface SourceDrawerApi {
  open: (target: SourceDrawerTarget) => void;
}

export const SourceDrawerContext = createContext<SourceDrawerApi | null>(null);
