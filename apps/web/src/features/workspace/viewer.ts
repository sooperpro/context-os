import type { SystemRole } from "@contextos/shared";

/**
 * Personas: who the UI is rendered for. The prototype has four, each with its own Home and rail. The
 * API knows system roles instead; People Ops is the `hr` role.
 */
export const PERSONAS = ["employee", "manager", "people_ops", "admin"] as const;
export type Persona = (typeof PERSONAS)[number];

export const PERSONA_LABEL: Record<Persona, string> = {
  employee: "Employee",
  manager: "Manager",
  people_ops: "HR",
  admin: "Admin",
};

/** The system role the UI gates on while a persona is previewed. */
export const PERSONA_ROLE: Record<Persona, SystemRole> = {
  employee: "member",
  manager: "manager",
  people_ops: "hr",
  admin: "admin",
};

export function personaForRole(role: SystemRole): Persona {
  if (role === "owner" || role === "admin") return "admin";
  if (role === "manager") return "manager";
  if (role === "hr") return "people_ops";
  return "employee";
}

export function isPersona(value: string | null | undefined): value is Persona {
  return PERSONAS.some((persona) => persona === value);
}

/*
 * Development preview, like the prototype's "View as": render the whole app (rail, Home, role-gated
 * controls) for another persona without a second account. Kept per tab in sessionStorage so it
 * survives reloads. In production builds `import.meta.env.DEV` is false: nothing is read or stored
 * and the preview is always null. The API still enforces the real role.
 */
const STORAGE_KEY = "contextos.preview-persona";
const listeners = new Set<() => void>();

function readStored(): Persona | null {
  if (!import.meta.env.DEV) return null;
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    return isPersona(stored) ? stored : null;
  } catch {
    return null;
  }
}

let previewPersona: Persona | null = readStored();

export function getPreviewPersona(): Persona | null {
  return previewPersona;
}

export function setPreviewPersona(next: Persona | null): void {
  if (!import.meta.env.DEV || next === previewPersona) return;
  previewPersona = next;
  try {
    if (next) sessionStorage.setItem(STORAGE_KEY, next);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private windows); the preview then lasts until reload.
  }
  for (const listener of listeners) listener();
}

export function subscribePreviewPersona(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
