import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { Providers } from "@/app/providers";
import { router } from "@/app/router";
import { env } from "@/config/env";
import "@/index.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}

/**
 * In development with VITE_MOCK_API=true, endpoints the API does not serve yet are answered with
 * preview data before the first request goes out. `import.meta.env.DEV` is false in production
 * builds, so the mock layer and MSW are dropped from the bundle entirely.
 */
async function startMockApi(): Promise<void> {
  if (!import.meta.env.DEV || !env.VITE_MOCK_API) return;
  const { startMockApi: start } = await import("@/mocks/browser");
  await start();
}

void startMockApi()
  .catch((error: unknown) => console.error("[mocks] The mock layer did not start.", error))
  .finally(() => {
    createRoot(rootElement).render(
      <StrictMode>
        <Providers>
          <RouterProvider router={router} />
        </Providers>
      </StrictMode>,
    );
  });
