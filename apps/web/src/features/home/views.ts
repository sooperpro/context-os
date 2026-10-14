import type { SystemRole } from "@contextos/shared";

/** The prototype has one Home per role. People Ops has no backend role yet (see the API backlog). */
export const HOME_VIEWS = ["employee", "manager", "people_ops", "admin"] as const;
export type HomeView = (typeof HOME_VIEWS)[number];

export const HOME_VIEW_LABEL: Record<HomeView, string> = {
  employee: "Employee",
  manager: "Manager",
  people_ops: "People Ops",
  admin: "Admin",
};

export function viewForRole(role: SystemRole): HomeView {
  if (role === "owner" || role === "admin") return "admin";
  if (role === "manager") return "manager";
  return "employee";
}

export function isHomeView(value: string | null): value is HomeView {
  return HOME_VIEWS.some((view) => view === value);
}
