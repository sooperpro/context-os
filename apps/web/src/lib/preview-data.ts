/**
 * Endpoints that the development mock layer (src/mocks) answers in place of the API. The mocks
 * register them before the app renders; in production nothing registers, so the set stays empty and
 * no screen is ever marked as preview data.
 */
const previewEndpoints = new Set<string>();

const keyOf = (method: string, path: string) => `${method.toUpperCase()} ${path}`;

export function registerPreviewEndpoints(keys: Iterable<string>): void {
  for (const key of keys) previewEndpoints.add(key);
}

/** True when `path` (as passed to `apiRequest`, e.g. "/v1/me/tasks") is answered by a mock. */
export function isPreviewEndpoint(path: string, method = "GET"): boolean {
  return previewEndpoints.has(keyOf(method, path));
}

export function mockKey(method: string, path: string): string {
  return keyOf(method, path);
}
