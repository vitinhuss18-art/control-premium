export interface RateLimitStore {
  consume(input: {
    key: string;
    windowStart: string;
    limit: number;
  }): Promise<{ count: number }>;
}

export type RateLimitPolicy = Readonly<{
  scope: string;
  limit: number;
  windowSeconds: number;
}>;

export class RateLimitExceededError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Limite de requisições excedido.");
    this.name = "RateLimitExceededError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class SecurityPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecurityPolicyError";
  }
}

function hashKey(value: string): string {
  let hash = 2_166_136_261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export class RateLimiter {
  private readonly store: RateLimitStore;
  private readonly now: () => Date;

  constructor(store: RateLimitStore, now: () => Date = () => new Date()) {
    this.store = store;
    this.now = now;
  }

  async assertAllowed(
    policy: RateLimitPolicy,
    identity: string,
  ): Promise<void> {
    if (
      !policy.scope.trim() ||
      !Number.isSafeInteger(policy.limit) ||
      policy.limit <= 0 ||
      !Number.isSafeInteger(policy.windowSeconds) ||
      policy.windowSeconds <= 0
    ) {
      throw new SecurityPolicyError("Política de rate limit inválida.");
    }
    const now = this.now();
    const windowMs = policy.windowSeconds * 1_000;
    const startMs = Math.floor(now.getTime() / windowMs) * windowMs;
    const result = await this.store.consume({
      key: policy.scope + ":" + hashKey(identity),
      windowStart: new Date(startMs).toISOString(),
      limit: policy.limit,
    });
    if (result.count > policy.limit) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((startMs + windowMs - now.getTime()) / 1_000),
      );
      throw new RateLimitExceededError(retryAfterSeconds);
    }
  }
}

const secretPattern =
  /token|secret|password|authorization|cookie|certificate|api[-_]?key/i;

export function redactSecurityLog(value: unknown, depth = 0): unknown {
  if (depth > 10) return "[MAX_DEPTH]";
  if (Array.isArray(value)) {
    return value.map((item) => redactSecurityLog(item, depth + 1));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        secretPattern.test(key)
          ? "[REDACTED]"
          : redactSecurityLog(nested, depth + 1),
      ]),
    );
  }
  return value;
}

export function assertSafeRedirect(
  value: string,
  allowedOrigins: readonly string[],
): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SecurityPolicyError("Endereço de retorno inválido.");
  }
  if (
    url.protocol !== "https:" ||
    !allowedOrigins.includes(url.origin) ||
    url.username ||
    url.password
  ) {
    throw new SecurityPolicyError("Endereço de retorno não autorizado.");
  }
  return url;
}
