import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { allowsNavGate, navGateForPath } from "@/lib/nav-sections";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const isLogin = pathname.startsWith("/login");
  const isAuthApi = pathname.startsWith("/api/auth");
  const isPublicQr =
    pathname.startsWith("/q/") || pathname.startsWith("/api/q/");

  if (isAuthApi) return NextResponse.next();
  if (isPublicQr) return NextResponse.next();
  if (pathname.startsWith("/brand/")) return NextResponse.next();

  if (!isLoggedIn && !isLogin) {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  if (isLoggedIn && isLogin) {
    return NextResponse.redirect(new URL("/calendar", req.nextUrl.origin));
  }

  const role =
    req.auth?.user && "role" in req.auth.user
      ? String(req.auth.user.role)
      : "";

  const gate = navGateForPath(pathname);
  if (isLoggedIn && gate && !allowsNavGate(gate, role)) {
    return NextResponse.redirect(new URL("/calendar", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|fonts/|brand/).*)",
  ],
};
