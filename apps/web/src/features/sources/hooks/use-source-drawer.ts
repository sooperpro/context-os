import { useContext } from "react";
import {
  SourceDrawerContext,
  type SourceDrawerApi,
} from "@/features/sources/components/source-drawer-context";

/** Open the source drawer from anywhere inside a project (evidence, citations, source lists). */
export function useSourceDrawer(): SourceDrawerApi {
  const api = useContext(SourceDrawerContext);
  if (!api) throw new Error("useSourceDrawer must be used within <SourceDrawerProvider>");
  return api;
}
