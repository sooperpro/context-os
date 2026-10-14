/**
 * Endpoints that the development mock layer (src/mocks) answers in place of the API. The mocks
 * register them before the app renders; in production nothing registers, so the sets stay empty and
 * no screen is ever marked as preview data.
 */
const previewKeys = new Set<string>();
const previewPaths = new Set<string>();

const keyOf = (method: string, path: string) => `${method.toUpperCase()} ${path}`;

export function registerPreviewEndpoints(keys: Iterable<string>): void {
  for (const key of keys) {
    previewKeys.add(key);
    previewPaths.add(key.slice(key.indexOf(" ") + 1));
  }
}

/**
 * True when `path` (as passed to `apiRequest`, e.g. "/v1/me/tasks") is answered by a mock: for that
 * `method`, or for any method when none is given.
 */
export function isPreviewEndpoint(path: string, method?: string): boolean {
  return method ? previewKeys.has(keyOf(method, path)) : previewPaths.has(path);
}

export function mockKey(method: string, path: string): string {
  return keyOf(method, path);
}
