export async function probeLocalServerReady({
  port,
  fetchImpl = fetch,
  timeoutMs = 3000,
  readyPath = "/api/ai/config",
  isReady = (response) => response.ok,
}) {
  try {
    const resp = await fetchImpl(`http://127.0.0.1:${port}${readyPath}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return {
      ok: isReady(resp),
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

export async function waitForLocalServerReady({
  probe = probeLocalServerReady,
  maxAttempts = 120,
  intervalMs = 500,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ...probeOptions
}) {
  let result = { ok: false, error: "Server readiness probe did not run" };

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    result = await probe(probeOptions);
    if (result.ok) return result;
    if (attempt + 1 < maxAttempts) await wait(intervalMs);
  }

  return result;
}
