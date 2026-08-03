import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const isLogin = pathname.startsWith("/login");
  const isAuthApi = pathname.startsWith("/api/auth");

  if (isAuthApi) return NextResponse.next();

  if (!isLoggedIn && !isLogin) {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  if (isLoggedIn && isLogin) {
    return NextResponse.redirect(new URL("/quotes", req.nextUrl.origin));
  }

  const role =
    req.auth?.user && "role" in req.auth.user
      ? String(req.auth.user.role)
      : "";

  const isDatabasePath =
    pathname.startsWith("/catalog") ||
    pathname.startsWith("/users") ||
    pathname.startsWith("/kits") ||
    pathname.startsWith("/clients") ||
    pathname.startsWith("/venues") ||
    pathname.startsWith("/vehicles") ||
    pathname.startsWith("/rates");

  const isAccountingPath =
    pathname.startsWith("/statistics") ||
    pathname.startsWith("/calculations") ||
    pathname.startsWith("/unpaid");

  if (
    isLoggedIn &&
    isDatabasePath &&
    role !== "MANAGER" &&
    role !== "BRIGADIER"
  ) {
    return NextResponse.redirect(new URL("/quotes", req.nextUrl.origin));
  }

  if (isLoggedIn && isAccountingPath && role !== "MANAGER") {
    return NextResponse.redirect(new URL("/quotes", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts/).*)"],
};
