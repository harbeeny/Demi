import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PATHS = ["/today", "/onboarding"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Refreshes the session cookie if expired; required for SSR auth.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  const isProtected = PROTECTED_PATHS.some((p) => path.startsWith(p));
  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  // Signed-in users don't belong on the marketing chatbot or login page.
  if (user && (path === "/" || path === "/login")) {
    const appUrl = request.nextUrl.clone();
    appUrl.pathname = "/today";
    return NextResponse.redirect(appUrl);
  }

  // Signed-out visitors see the public landing page at "/".

  return response;
}

export const config = {
  matcher: ["/", "/today/:path*", "/onboarding/:path*", "/login", "/api/plan"],
};
