export const DEFAULT_PROVIDER_BATCH_CONCURRENCY = 1;
export const MAX_PROVIDER_BATCH_CONCURRENCY = 3;

export function resolveProviderBatchConcurrency(value: string | number | undefined): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_PROVIDER_BATCH_CONCURRENCY;
  return Math.max(1, Math.min(MAX_PROVIDER_BATCH_CONCURRENCY, Math.floor(parsed)));
}

export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<Array<PromiseSettledResult<R>>> {
  const results: Array<PromiseSettledResult<R>> = new Array(items.length);
  let nextIndex = 0;

  async function runNext() {
    const currentIndex = nextIndex;
    nextIndex += 1;
    if (currentIndex >= items.length) return;

    try {
      results[currentIndex] = {
        status: "fulfilled",
        value: await worker(items[currentIndex]!, currentIndex),
      };
    } catch (reason) {
      results[currentIndex] = { status: "rejected", reason };
    }

    await runNext();
  }

  const workerCount = Math.min(Math.max(1, Math.floor(limit)), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runNext()));
  return results;
}
