// ponytail: minimal logger — console only. No remote, no child, no levels.
// Upgrade: re-add levels/remote if telemetry needed.
export const log = {
  warn(message: string, context: Record<string, unknown>) {
    // eslint-disable-next-line no-console
    console.warn(`[warn] ${message}`, context);
  },
  error(message: string, context: Record<string, unknown>, error?: unknown) {
    // eslint-disable-next-line no-console
    console.error(`[error] ${message}`, context, error ?? "");
  },
  info(_msg: string, _ctx: Record<string, unknown>) {},
  debug(_msg: string, _ctx: Record<string, unknown>) {},
};
