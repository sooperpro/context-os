import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// Dialogs, menus and typed input in jsdom take longer on a loaded machine; the default 1s
// `findBy` budget turned real passes into flaky failures.
configure({ asyncUtilTimeout: 5_000 });

afterEach(() => {
  cleanup();
});
