/** Match browser origins against the direct URL or the host/protocol supplied by
 * the deployment proxy. The proxy must overwrite incoming forwarding headers. */
export function validRequestOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin == null) return true;
  try {
    const parsed = new URL(origin);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin) return false;
    const direct = new URL(request.url);
    if (origin === direct.origin) return true;
    const protocol = request.headers.get("x-forwarded-proto") ?? direct.protocol.slice(0, -1);
    if (protocol !== "http" && protocol !== "https") return false;
    // A forwarded host takes precedence over the internal Host header.
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (!host || /[\s,/@\\?#]/.test(host)) return false;
    return origin === new URL(`${protocol}://${host}`).origin;
  } catch { return false; }
}
