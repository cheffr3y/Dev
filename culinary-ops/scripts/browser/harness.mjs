const fixtures = {
  "/prep_workflow_test": "PREP_DISPOSABLE_DB",
  "/homestead_test": "HOMESTEAD_DISPOSABLE_DB",
  "/to_go_test": "TO_GO_DISPOSABLE_DB",
  "/venue_test": "VENUE_DISPOSABLE_DB",
};

export function assertDisposableBrowserEnvironment(expectedDatabase) {
  const database = new URL(process.env.DATABASE_URL || "postgresql://invalid");
  const flag = fixtures[database.pathname];
  if (database.hostname !== "127.0.0.1" || !flag || process.env[flag] !== "1" ||
      (expectedDatabase && database.pathname !== `/${expectedDatabase}`)) {
    throw new Error("Browser checks require their disposable loopback database harness.");
  }
  const origin = new URL(process.env.AUTH_URL || "http://invalid");
  if (origin.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) ||
      origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("Browser checks require a local AUTH_URL with no credentials or path.");
  }
}

// Evaluated before any case creates fixtures, even when run directly.
assertDisposableBrowserEnvironment();

export function browserBaseUrl() {
  return new URL(process.env.AUTH_URL).origin;
}

export async function launchBrowser() {
  const { chromium } = await import(process.env.PREP_PLAYWRIGHT_MODULE || "playwright");
  return chromium.launch({
    headless: true,
    ...(process.env.PREP_BROWSER_EXECUTABLE ? { executablePath: process.env.PREP_BROWSER_EXECUTABLE } : {}),
  });
}

export async function waitForServer() {
  const url = `${browserBaseUrl()}/login`;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error("Disposable application server did not become ready.");
}
