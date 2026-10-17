/** Whether the visitor asked for less motion: then nothing on the landing page moves on its own. */
export const prefersLessMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
