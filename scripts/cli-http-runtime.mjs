export function getApiGetTimeoutMs(path) {
  if (path === "/api/ai/health") {
    return 15000;
  }

  return 10000;
}
