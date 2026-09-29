import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isLoggedIn = !!auth;
      const isLogin = pathname.startsWith("/login");
      const isAuthApi = pathname.startsWith("/api/auth");
      if (isAuthApi) return true;
      if (isLogin) return true;
      return isLoggedIn;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as
        | "ADMIN"
        | "MANAGER"
        | "EMPLOYEE"
        | "BRIGADIER";
      session.user.email = token.email ?? "";
      session.user.name = token.name ?? "";
      return session;
    },
    redirect({ url, baseUrl }) {
      // Prefer the Host the browser actually used (AUTH_TRUST_HOST).
      // Stale AUTH_URL (old LAN IP) used to force every callback onto a dead host.
      const requestBase = baseUrl.replace(/\/$/, "");
      const authUrl = process.env.AUTH_URL?.replace(/\/$/, "") || "";
      let publicBase = requestBase;
      try {
        const host = new URL(requestBase).hostname;
        if ((host === "0.0.0.0" || host === "") && authUrl) {
          publicBase = authUrl;
        }
      } catch {
        if (authUrl) publicBase = authUrl;
      }
      if (url.startsWith("/")) return `${publicBase}${url}`;
      try {
        const next = new URL(url);
        if (next.hostname === "0.0.0.0") {
          return `${publicBase}${next.pathname}${next.search}`;
        }
        if (next.origin === publicBase || next.origin === requestBase) return url;
        if (authUrl && next.origin === authUrl) return url;
      } catch {
        /* ignore malformed */
      }
      return publicBase;
    },
  },
} satisfies NextAuthConfig;
