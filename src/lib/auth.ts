import { type NextAuthOptions, type CookieOption } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "./prisma";

const authSecret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
const isSecure =
  process.env.NEXTAUTH_URL?.startsWith("https://") ??
  process.env.NODE_ENV === "production";

// Force non-prefixed cookie names. Railway's HTTPS proxy can drop __Secure-
// prefixed cookies during the Google OAuth roundtrip, which causes error=Callback.
function cookie(name: string, maxAge?: number): CookieOption {
  return {
    name,
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      path: "/",
      secure: isSecure,
      ...(maxAge != null && { maxAge }),
    },
  };
}

async function ensureAppUser(params: {
  id?: string | null;
  email?: string | null;
  name?: string | null;
  image?: string | null;
}) {
  const { id, email, name, image } = params;

  if (!email) {
    return id ?? null;
  }

  const dbUser = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: name ?? undefined,
      image: image ?? undefined,
    },
    update: {
      name: name ?? undefined,
      image: image ?? undefined,
    },
  });

  return dbUser.id;
}

export const authOptions: NextAuthOptions = {
  // No adapter — the PrismaAdapter crashes during the OAuth callback with
  // Prisma v6, producing error=Callback. We persist user/account data manually
  // in the jwt callback instead, with proper error handling.
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
    callbackUrl: cookie("next-auth.callback-url"),
    csrfToken: cookie("next-auth.csrf-token"),
    state: cookie("next-auth.state", 900),
    pkceCodeVerifier: cookie("next-auth.pkce.code_verifier", 900),
  },
  callbacks: {
    async jwt({ token, user, account }) {
      // On sign-in (user + account present), persist to DB and enrich the token
      if (account && user) {
        try {
          const dbUserId = await ensureAppUser({
            email: user.email,
            name: user.name,
            image: user.image,
          });
          token.id = dbUserId ?? user.id;

          // Persist OAuth tokens so calendar APIs can use them later
          await prisma.account.upsert({
            where: {
              provider_providerAccountId: {
                provider: account.provider,
                providerAccountId: account.providerAccountId,
              },
            },
            create: {
              userId: token.id as string,
              type: account.type,
              provider: account.provider,
              providerAccountId: account.providerAccountId,
              access_token: account.access_token as string | undefined,
              refresh_token: account.refresh_token as string | undefined,
              expires_at: account.expires_at as number | undefined,
              token_type: account.token_type as string | undefined,
              scope: account.scope as string | undefined,
              id_token: account.id_token as string | undefined,
            },
            update: {
              access_token: account.access_token as string | undefined,
              refresh_token: account.refresh_token as string | undefined,
              expires_at: account.expires_at as number | undefined,
              token_type: account.token_type as string | undefined,
              scope: account.scope as string | undefined,
              id_token: account.id_token as string | undefined,
            },
          });
        } catch (e) {
          console.error("[auth] Failed to persist user/account:", e);
          // Fall back to Google sub so the session still works
          token.id = user.id;
        }

        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        try {
          const dbUserId = await ensureAppUser({
            id: token.id as string | undefined,
            email: session.user.email,
            name: session.user.name,
            image: session.user.image,
          });
          (session.user as { id: string }).id = dbUserId ?? (token.id as string);
        } catch {
          (session.user as { id: string }).id = token.id as string;
        }
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
  },
};
