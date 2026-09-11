import pino from "pino";

// drizzle-orm's DrizzleQueryError bakes the failing SQL and its bound parameters straight
// into `message` (`Failed query: <sql>\nparams: <values>`) and `stack` repeats that message
// at the top before the frames. Bound parameters are whole rows of user data (counterparties,
// amounts, phone numbers), so both need scrubbing before a log line reaches disk/Sentry — not
// just the `query`/`params` properties pino would otherwise copy over verbatim.
//
// Detection is deliberately two-pronged: `err.constructor.name === "DrizzleQueryError"` covers
// a real instance reaching us intact, while the `message` prefix check covers anything shaped
// like one that lost its prototype chain in transit (e.g. crossing a serialization boundary).
export const errSerializer = (err: Error): Record<string, unknown> => {
  const serialized = pino.stdSerializers.err(err) as Record<string, unknown>;
  delete serialized.query;
  delete serialized.params;

  const ctorName = (err as { constructor?: { name?: string } })?.constructor?.name;
  const isDrizzleQueryError =
    ctorName === "DrizzleQueryError" || (typeof err.message === "string" && err.message.startsWith("Failed query:"));

  if (isDrizzleQueryError) {
    const cause = (err as { cause?: { message?: unknown } }).cause;
    const causeMessage = typeof cause?.message === "string" ? cause.message : undefined;
    const message = "DrizzleQueryError: " + (causeMessage ?? "query failed");
    serialized.message = message;

    // Drop everything up to (and including) the original `Failed query: ...` message block —
    // it's the part carrying the SQL/params — and keep only the stack frames after it.
    const lines = String(serialized.stack ?? "").split("\n");
    const frameStart = lines.findIndex((l) => l.startsWith("    at "));
    const frames = frameStart >= 0 ? lines.slice(frameStart) : [];
    serialized.stack = [message, ...frames].join("\n");

    // pino's own err serializer folds `cause` into `message`/`stack` rather than exposing it
    // as a field (and `cause.message`/`cause.stack` are non-enumerable on a real Error, so a
    // plain spread would silently drop them). Re-expose a minimal, scrubbed `cause` here so
    // the underlying constraint/driver error is still visible without its own query/params.
    if (cause && typeof cause === "object") {
      const causeCopy: Record<string, unknown> = { ...(cause as Record<string, unknown>) };
      if (causeMessage !== undefined) causeCopy.message = causeMessage;
      delete causeCopy.query;
      delete causeCopy.params;
      serialized.cause = causeCopy;
    }
  }

  return serialized;
};

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),
  redact: ["req.headers.authorization", "req.headers.cookie"],
  serializers: {
    err: errSerializer,
  },
});
