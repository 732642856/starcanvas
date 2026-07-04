function shouldRetryProviderSmokeConfig(result) {
  if (!result || result.ok) return false;
  if (typeof result.status === "number" && result.status >= 400 && result.status < 500) {
    return false;
  }

  const message = String(
    result.error ||
    result.data?.message ||
    result.data?.error ||
    "",
  ).toLowerCase();

  return (
    message.includes("timeout") ||
    message.includes("aborted") ||
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("econnrefused")
  );
}

export async function loadProviderSmokeConfigWithWarmup({
  apiGet,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  attempts = 3,
  configPath = "/api/ai/config",
}) {
  let lastResult = null;
  let usedRetry = false;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await apiGet(configPath);
    lastResult = result;
    if (result.ok) {
      return {
        ok: true,
        config: result.data,
        usedRetry,
      };
    }

    if (attempt >= attempts || !shouldRetryProviderSmokeConfig(result)) {
      return {
        ok: false,
        error: result.error || result.data?.error || result.data?.message || "未知错误",
        data: result.data,
        usedRetry,
      };
    }

    usedRetry = true;
    await sleep(Math.min(2500, attempt * 800));
  }

  return {
    ok: false,
    error: lastResult?.error || lastResult?.data?.error || lastResult?.data?.message || "未知错误",
    data: lastResult?.data,
    usedRetry,
  };
}
