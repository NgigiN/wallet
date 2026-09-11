import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),
  redact: ["req.headers.authorization", "req.headers.cookie"],
  serializers: {
    // drizzle's DrizzleQueryError carries the failing SQL and its bound parameters, i.e.
    // whole rows of user data (counterparties, amounts, emails). Keep the message and the
    // stack, drop the payload.
    err: (err: Error) => {
      const serialized = pino.stdSerializers.err(err) as Record<string, unknown>;
      delete serialized.query;
      delete serialized.params;
      return serialized;
    },
  },
});
