import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { meQuery } from "@/features/account/api/account.queries";
import { welcomeQuery } from "@/features/welcome/api/welcome.queries";

const seenKey = (userId: string) => `contextos.welcome-opened.${userId}`;

const alreadyOpened = (userId: string) => {
  try {
    return sessionStorage.getItem(seenKey(userId)) === "1";
  } catch {
    return false;
  }
};

const markOpened = (userId: string) => {
  try {
    sessionStorage.setItem(seenKey(userId), "1");
  } catch {
    // Without storage the welcome may open again on a reload; that is harmless.
  }
};

/**
 * Opens the first-day welcome once per sign-in for a new hire who hasn't finished it. "Skip for
 * now" still works: it returns to the app and stays there until the next sign-in.
 */
export function useFirstDayRedirect() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const welcome = useQuery(welcomeQuery());
  const userId = useQuery(meQuery()).data?.id;
  const due = welcome.data?.due === true;
  useEffect(() => {
    if (!due || !userId || alreadyOpened(userId)) return;
    markOpened(userId);
    void navigate("/welcome", { replace: pathname === "/" });
  }, [due, userId, navigate, pathname]);
}
