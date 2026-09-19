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
      const publicBase = (process.env.AUTH_URL || baseUrl).replace(/\/$/, "");
      if (url.startsWith("/")) return `${publicBase}${url}`;
      try {
        const next = new URL(url);
        if (next.hostname === "0.0.0.0" || next.hostname === "localhost") {
          return `${publicBase}${next.pathname}${next.search}`;
        }
        if (next.origin === publicBase || next.origin === baseUrl) return url;
      } catch {
        /* ignore malformed */
      }
      return publicBase;
    },
  },
} satisfies NextAuthConfig;
