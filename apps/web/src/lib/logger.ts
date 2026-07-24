const sensitiveKey =
  /token|secret|password|authorization|certificate|api[-_]?key/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        sensitiveKey.test(key) ? "[REDACTED]" : redact(nestedValue),
      ]),
    );
  }

  return value;
}

export const logger = {
  info(message: string, metadata: Record<string, unknown> = {}) {
    console.info(message, redact(metadata));
  },
  error(message: string, metadata: Record<string, unknown> = {}) {
    console.error(message, redact(metadata));
  },
};
