import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

import {
  findDashboardAccountByEmail,
  findDashboardAccountById,
  findDashboardAccountByProviderIdentity,
  upsertDashboardAccount,
  type AuthProvider,
  type DashboardAccount,
} from "./account";
import { authorizeEmailPassword } from "./auth-email";
import {
  oauthEmailVerifiedAt,
  oauthSuccessfulSignInResult,
} from "./auth-oauth";
import { normalizeEmail } from "./otp";

const githubClientId = process.env.GITHUB_CLIENT_ID?.trim();
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();

const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

const authSecret =
  process.env.AUTH_SECRET?.trim() ?? process.env.NEXTAUTH_SECRET?.trim();

if (!authSecret) {
  throw new Error("AUTH_SECRET or NEXTAUTH_SECRET is required");
}

function authUser(user: DashboardAccount) {
  return {
    id: user.id,
    name: user.display_name,
    email: user.email,
  };
}

async function authDatabaseOperation<T>(
  context: string,
  operation: () => Promise<T>,
) {
  try {
    return await operation();
  } catch (error) {
    console.error(`[auth:${context}] database operation failed`, error);
    throw error;
  }
}

function profileValue(
  profile: Record<string, unknown>,
  key: string,
) {
  const value = profile[key];
  return value === null || value === undefined ? "" : String(value);
}

const providers = [
  ...(githubClientId && githubClientSecret
    ? [
        GitHub({
          clientId: githubClientId,
          clientSecret: githubClientSecret,
          authorization: {
            params: {
              prompt: "select_account",
            },
          },
        }),
      ]
    : []),

  ...(googleClientId && googleClientSecret
    ? [
        Google({
          clientId: googleClientId,
          clientSecret: googleClientSecret,
          authorization: {
            params: {
              prompt: "consent select_account",
              access_type: "offline",
              response_type: "code",
            },
          },
        }),
      ]
    : []),

  Credentials({
    name: "Email OTP",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
      otp: { label: "OTP", type: "text" },
      otpCode: { label: "OTP code", type: "text" },
    },
    async authorize(credentials) {
      const user = await authDatabaseOperation(
        "credentials-authorize",
        () => authorizeEmailPassword({
          email: String(credentials?.email ?? ""),
          password: String(credentials?.password ?? ""),
          otp: String(credentials?.otpCode ?? credentials?.otp ?? ""),
        }),
      );

      return user ? authUser(user) : null;
    },
  }),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: authSecret,

  trustHost: true,

  providers,

  pages: {
    signIn: "/login",
    error: "/login",
  },

  callbacks: {
    async signIn({ account, profile, user }) {
      if (account?.provider === "credentials") {
        return authDatabaseOperation(
          "credentials-sign-in",
          async () => Boolean(
            user?.id &&
            user.email &&
            (await findDashboardAccountById(user.id)),
          ),
        );
      }

      if (
        (account?.provider !== "google" &&
          account?.provider !== "github") ||
        !profile
      ) {
        return false;
      }

      const provider = account.provider as AuthProvider;
      const profileRecord = profile as Record<string, unknown>;
      const providerAccountId =
        account.providerAccountId ||
        (provider === "google"
          ? profileValue(profileRecord, "sub")
          : profileValue(profileRecord, "id"));

      const username =
        provider === "google"
          ? profileValue(profileRecord, "name")
          : profileValue(profileRecord, "login") ||
            profileValue(profileRecord, "name");

      const profileEmail =
        user.email ?? profileValue(profileRecord, "email");
      const email =
        normalizeEmail(profileEmail) ||
        (provider === "github" && providerAccountId
          ? `${username || providerAccountId}@users.noreply.github.com`
          : "");

      if (!providerAccountId || !email || !username) {
        return false;
      }

      return authDatabaseOperation("oauth-sign-in", async () => {
        const existingUser =
          (await findDashboardAccountByProviderIdentity(
            provider,
            providerAccountId,
          )) ?? (await findDashboardAccountByEmail(email));

        await upsertDashboardAccount({
          provider,
          providerAccountId,
          username,
          email,
          emailVerifiedAt: oauthEmailVerifiedAt({
            provider,
            account: existingUser,
          }),
        });

        return oauthSuccessfulSignInResult();
      });
    },

    async jwt({ token, user, account }) {
      const databaseUser = await authDatabaseOperation(
        "jwt",
        async (): Promise<DashboardAccount | null> => {
          if (
            account?.provider === "google" ||
            account?.provider === "github"
          ) {
            const providerAccount = await findDashboardAccountByProviderIdentity(
              account.provider,
              account.providerAccountId,
            );

            if (!providerAccount && user.email) {
              return findDashboardAccountByEmail(user.email);
            }

            return providerAccount;
          }

          if (user?.id) {
            return findDashboardAccountById(user.id);
          }

          if (token.sub) {
            return findDashboardAccountById(token.sub);
          }

          return null;
        }
      );

      if (!databaseUser) {
        token.invalid = true;
        token.error = "stale_session";
        return token;
      }

      token.sub = databaseUser.id;
      token.name = databaseUser.display_name;
      token.email = databaseUser.email;
      delete token.invalid;
      delete token.error;

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.name = token.name ?? session.user.name;
        session.user.email = token.email ?? session.user.email;
      }

      session.invalid = Boolean(token.invalid);
      session.error =
        token.error === "stale_session" ? "stale_session" : undefined;

      return session;
    },

    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) {
        return `${baseUrl}${url}`;
      }

      if (url.startsWith(baseUrl)) {
        return url;
      }

      return `${baseUrl}/dashboard`;
    },
  },
});
