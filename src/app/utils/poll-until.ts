export interface PollOptions {
  /** Delay before the next attempt; a function receives the number of completed attempts. */
  intervalMs: number | ((completedAttempts: number) => number);
  timeoutMs?: number;
  maxAttempts?: number;
  initialDelay?: boolean;
  waitAfterLastAttempt?: boolean;
  signal?: AbortSignal;
}

/** Return the first defined result, or undefined on timeout, attempt exhaustion or cancellation. */
export async function pollUntil<T>(
  check: (attempt: number) => Promise<T | undefined>,
  options: PollOptions,
): Promise<T | undefined> {
  const started = Date.now();
  let attempts = 0;
  const delay = () =>
    typeof options.intervalMs === 'function' ? options.intervalMs(attempts) : options.intervalMs;
  while (
    !options.signal?.aborted &&
    attempts < (options.maxAttempts ?? Infinity) &&
    (options.timeoutMs === undefined || Date.now() - started < options.timeoutMs)
  ) {
    if ((attempts > 0 || options.initialDelay) && !(await wait(delay(), options.signal))) {
      return undefined;
    }
    if (options.signal?.aborted) return undefined;
    let result: T | undefined;
    try {
      result = await check(++attempts);
    } catch (error) {
      if (options.signal?.aborted) return undefined;
      throw error;
    }
    if (options.signal?.aborted) return undefined;
    if (result !== undefined) return result;
  }
  if (
    options.waitAfterLastAttempt &&
    attempts === options.maxAttempts &&
    !options.signal?.aborted
  ) {
    await wait(delay(), options.signal);
  }
  return undefined;
}

function wait(ms: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const finish = (completed: boolean) => {
      signal?.removeEventListener('abort', abort);
      resolve(completed);
    };
    const timer = setTimeout(() => finish(true), ms);
    const abort = () => {
      clearTimeout(timer);
      finish(false);
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}
