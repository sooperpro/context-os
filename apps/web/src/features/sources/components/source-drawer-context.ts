import { createContext } from "react";

export interface SourceDrawerTarget {
  sourceId: string;
  /** Evidence quote to surface at the top of the drawer. */
  quote?: string;
}

export interface SourceDrawerApi {
  open: (target: SourceDrawerTarget) => void;
}

export const SourceDrawerContext = createContext<SourceDrawerApi | null>(null);
