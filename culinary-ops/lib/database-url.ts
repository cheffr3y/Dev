// Prisma's CPU-derived default can exceed a small managed database's budget,
// especially when old and new containers overlap during a deployment.
export function applicationDatabaseUrl(value: string | undefined): string | undefined {
  if (!value) return value;
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("DATABASE_URL must be a valid database connection URL."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) return value;
  const defaults = { connection_limit: "3", pool_timeout: "20", connect_timeout: "10", max_idle_connection_lifetime: "30" };
  for (const [key, setting] of Object.entries(defaults)) {
    if (!url.searchParams.has(key)) url.searchParams.set(key, setting);
  }
  return url.toString();
}
