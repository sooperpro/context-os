import { useCallback, useEffect, useState } from "react";

/*
 * The signed-out pages. The auth gate renders them before the app's router exists, so they keep a
 * small history of their own: three paths, pushState, and popstate for the back button.
 */
export type AuthView = "sign-in" | "sign-up" | "sso-callback";

export const AUTH_PATH: Record<AuthView, string> = {
  "sign-in": "/sign-in",
  "sign-up": "/sign-up",
  "sso-callback": "/sso-callback",
};

/** Any other path shows sign-in, and the person lands back on it afterwards. */
export function viewForPath(pathname: string): AuthView {
  if (pathname === AUTH_PATH["sign-up"]) return "sign-up";
  if (pathname === AUTH_PATH["sso-callback"]) return "sso-callback";
  return "sign-in";
}

export function isAuthPath(pathname: string): boolean {
  return Object.values(AUTH_PATH).includes(pathname);
}

export function useAuthView(): [AuthView, (view: AuthView) => void] {
  const [view, setView] = useState(() => viewForPath(window.location.pathname));
  useEffect(() => {
    const onPopState = () => setView(viewForPath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  const go = useCallback((next: AuthView) => {
    rememberDestination();
    window.history.pushState(null, "", AUTH_PATH[next]);
    setView(next);
  }, []);
  return [view, go];
}

const DESTINATION_KEY = "contextos.after-sign-in";

/** Keep the page the person opened (a shared link, say) so signing in lands them there. */
export function rememberDestination(): void {
  const { pathname, search, hash } = window.location;
  if (isAuthPath(pathname)) return;
  try {
    sessionStorage.setItem(DESTINATION_KEY, `${pathname}${search}${hash}`);
  } catch {
    // Storage can be unavailable (private windows); they land on Home instead.
  }
}

function takeDestination(): string {
  try {
    const stored = sessionStorage.getItem(DESTINATION_KEY);
    sessionStorage.removeItem(DESTINATION_KEY);
    // Same-origin paths only.
    return stored?.startsWith("/") && !stored.startsWith("//") ? stored : "/";
  } catch {
    return "/";
  }
}

/**
 * Leaves the signed-out pages once a session exists: a full load of the remembered page, so the app
 * starts with the session. `decorateUrl` is Clerk's, from `finalize({ navigate })`.
 */
export function enterApp(decorateUrl?: (url: string) => string): void {
  const destination = takeDestination();
  window.location.replace(decorateUrl ? decorateUrl(destination) : destination);
}
