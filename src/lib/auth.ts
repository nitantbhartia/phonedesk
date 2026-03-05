import { type NextAuthOptions, type CookieOption } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "./prisma";

const authSecret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
const isSecure = process.env.NEXTAUTH_URL?.startsWith("https://") ?? process.env.NODE_ENV === "production";

// Force non-prefixed cookie names. Railway's HTTPS proxy can drop __Secure-
// prefixed cookies during the Google OAuth roundtrip, which causes error=Callback.
function cookie(name: string, maxAge?: number): CookieOption {
  return {
    name,
    options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: isSecure, ...(maxAge != null && { maxAge }) },
  };
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  secret: authSecret,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  cookies: {
    sessionToken: cookie("next-auth.session-token"),
    callbackUrl:  cookie("next-auth.callback-url"),
    csrfToken:    cookie("next-auth.csrf-token"),
    state:        cookie("next-auth.state", 900),
    pkceCodeVerifier: cookie("next-auth.pkce.code_verifier", 900),
  },
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
      }
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id: string }).id = token.id as string;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) {
        return `${baseUrl}${url}`;
      }
      try {
        const target = new URL(url);
        const base = new URL(baseUrl);
        if (target.origin === base.origin) {
          return target.toString();
        }
      } catch {
        // Invalid URL, fall through to default
      }
      return baseUrl;
    },
  },
  pages: {
    signIn: "/",
    newUser: "/onboarding",
  },
};
