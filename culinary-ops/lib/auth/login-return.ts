export function safeReturnTo(raw: unknown) {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//") || /[\\\r\n]/.test(raw)) return "/";
  const url = new URL(raw, "https://mise.invalid");
  return url.origin === "https://mise.invalid" && !url.pathname.startsWith("/login") ? `${url.pathname}${url.search}${url.hash}` : "/";
}
