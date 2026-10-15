import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// Dialogs, menus and typed input in jsdom take longer on a loaded machine; the default 1s
// `findBy` budget turned real passes into flaky failures.
configure({ asyncUtilTimeout: 5_000 });

// jsdom has no pointer capture; the toaster's swipe-to-dismiss calls it when a toast is pressed.
if (!("setPointerCapture" in Element.prototype))
  Object.assign(Element.prototype, {
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
  });

afterEach(() => {
  cleanup();
});
