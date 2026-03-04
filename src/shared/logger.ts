import pino from 'pino';

export type LoggerContext = {
  bankId?: string;
  accountId?: string;
};

export type Logger = pino.Logger;

type WriteFn = (line: string) => void;

/**
 * Create a structured pino logger with optional context binding and credential redaction.
 * @param context Optional bankId/accountId to bind to every log entry
 * @param writeFn Optional custom write function (used in tests)
 */
export function createLogger(context: LoggerContext = {}, writeFn?: WriteFn): Logger {
  const level = process.env['LOG_LEVEL'] ?? 'info';

  // When writeFn is provided (e.g., in tests), use it as a synchronous raw stream.
  // Otherwise, write to stdout (fd 1).
  const destination: pino.DestinationStream = writeFn
    ? { write: writeFn }
    : pino.destination(1);

  const base = pino(
    {
      level,
      redact: {
        paths: ['password', 'credentials', 'j_password', '*.password', '*.j_password', '*.credentials'],
        censor: '[REDACTED]',
      },
      base: undefined, // remove pid/hostname
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    destination,
  );

  return Object.keys(context).length > 0 ? base.child(context) : base;
}
