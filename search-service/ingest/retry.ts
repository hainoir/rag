import { toErrorMessage } from "./errors.ts";

export type RetryConfig = {
  retryAttempts: number;
  retryDelayMs: number;
  retryMaxDelayMs: number;
};

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function computeRetryDelayMs(nextAttempt: number, baseDelayMs: number, maxDelayMs: number) {
  const exponent = Math.min(10, Math.max(0, nextAttempt - 2));
  const delay = baseDelayMs * 2 ** exponent;

  return Math.min(maxDelayMs, delay);
}

export function isRetryableIngestError(error: unknown) {
  const message = toErrorMessage(error);

  if (message.startsWith("MODERATION_BLOCKED:")) {
    return false;
  }

  if (
    message.includes("No chunks generated") ||
    message.includes("No article content extracted") ||
    message.includes("Unable to locate article content root") ||
    message.includes("Unable to extract article title")
  ) {
    return false;
  }

  const status = message.match(/(?:Unexpected response status|Moderation API returned HTTP) (\d+)/)?.[1];

  if (status) {
    const code = Number(status);

    return code === 408 || code === 429 || code >= 500;
  }

  return true;
}

export async function runWithRetry<T>(
  task: () => Promise<T>,
  config: RetryConfig,
  onRetry?: (attempt: number, error: unknown) => Promise<void> | void,
  sleepFn: (ms: number) => Promise<void> = sleep,
) {
  let attempt = 1;

  while (true) {
    try {
      return await task();
    } catch (error) {
      if (!isRetryableIngestError(error) || attempt >= config.retryAttempts) {
        throw error;
      }

      attempt += 1;
      await onRetry?.(attempt, error);
      await sleepFn(computeRetryDelayMs(attempt, config.retryDelayMs, config.retryMaxDelayMs));
    }
  }
}
