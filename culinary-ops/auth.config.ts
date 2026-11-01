import type { NextAuthConfig } from "next-auth";
import { safeReturnTo } from "./lib/login-return";

// Edge-safe config (no DB/bcrypt). Shared by middleware and the full
// Node-runtime auth in auth.ts.
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = nextUrl;
      // Public trivia surface: the guest plays by room code with no account.
      // These handlers only ever touch Trivia* data, scoped by code + player
      // token — everything else in the app still requires a session.
      if (pathname.startsWith("/play") || pathname.startsWith("/api/trivia")) {
        return true;
      }
      if ((pathname === "/api/workspace" || pathname.startsWith("/api/invoices")) && !isLoggedIn) return Response.json({ ok: false, error: "Sign in again to continue." }, { status: 401 });
      const isLoginPage = pathname.startsWith("/login");
      if (isLoginPage) {
        if (isLoggedIn) return Response.redirect(new URL(safeReturnTo(nextUrl.searchParams.get("returnTo")), nextUrl));
        return true;
      }
      if (!isLoggedIn && pathname === "/prep-orders/closeout/scan") {
        const login = new URL("/login", nextUrl);
        login.searchParams.set("returnTo", `${pathname}${nextUrl.search}`);
        return Response.redirect(login);
      }
      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role?: string }).role ?? "STAFF";
        token.homeVenueId = (user as { homeVenueId?: string | null }).homeVenueId ?? null;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.homeVenueId = (token.homeVenueId as string | null) ?? null;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
