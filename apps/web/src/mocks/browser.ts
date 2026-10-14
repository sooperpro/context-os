import { setupWorker } from "msw/browser";
import { registerPreviewEndpoints } from "@/lib/preview-data";
import { mockEndpoints } from "@/mocks/endpoints";

/**
 * Starts the development mock layer: a service worker answers the endpoints in `mockEndpoints` and
 * lets every other request through to the API. Loaded only by `main.tsx` in development with
 * VITE_MOCK_API=true; production builds never include this module.
 */
export async function startMockApi(): Promise<void> {
  const worker = setupWorker(...mockEndpoints.map((endpoint) => endpoint.handler));
  await worker.start({ onUnhandledRequest: "bypass", quiet: true });
  registerPreviewEndpoints(mockEndpoints.map((endpoint) => endpoint.key));
  // Development only: say which requests never reach the API.
  // eslint-disable-next-line no-console
  console.info(
    `[mocks] ${mockEndpoints.length} endpoints answered with preview data:`,
    mockEndpoints.map((endpoint) => endpoint.key),
  );
}
