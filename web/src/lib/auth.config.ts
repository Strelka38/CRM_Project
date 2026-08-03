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
      session.user.role = token.role as "MANAGER" | "EMPLOYEE" | "BRIGADIER";
      session.user.email = token.email ?? "";
      session.user.name = token.name ?? "";
      return session;
    },
  },
} satisfies NextAuthConfig;
