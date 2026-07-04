export async function probeLocalServerReady({
  port,
  fetchImpl = fetch,
  timeoutMs = 3000,
  readyPath = "/api/ai/config",
}) {
  try {
    const resp = await fetchImpl(`http://127.0.0.1:${port}${readyPath}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return {
      ok: resp.ok,
      status: resp.status,
      path: readyPath,
    };
  } catch (error) {
    return {
      ok: false,
      path: readyPath,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
