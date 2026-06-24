import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

import {
  findDashboardAccountByEmail,
  findDashboardAccountById,
  findDashboardAccountByProviderIdentity,
  markDashboardAccountEmailVerified,
  setDashboardAccountPassword,
  upsertDashboardAccount,
  type AuthProvider,
  type DashboardAccount,
} from "./account";
import { oauthPostLoginRedirect } from "./auth-oauth";
import { normalizeEmail, verifyOtpChallenge } from "./otp";
import {
  hashPassword,
  isValidPassword,
  verifyPassword,
} from "./password";

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
    name: user.github_username,
    email: user.email,
  };
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
      const email = normalizeEmail(String(credentials?.email ?? ""));
      const password = String(credentials?.password ?? "");
      const otp = String(credentials?.otpCode ?? credentials?.otp ?? "");

      const existingUser = await findDashboardAccountByEmail(email);

      if (password && !otp) {
        if (
          !existingUser?.password_hash ||
          !(await verifyPassword(password, existingUser.password_hash))
        ) {
          return null;
        }

        return authUser(existingUser);
      }

      if (!otp) return null;

      const verification = await verifyOtpChallenge(email, otp);

      if (!verification.ok) {
        return null;
      }

      if (existingUser) {
        if (!existingUser.password_hash && isValidPassword(password)) {
          const user = await setDashboardAccountPassword(
            existingUser.id,
            await hashPassword(password),
          );

        if (!user) return null;
        }

        const verifiedUser = await markDashboardAccountEmailVerified(existingUser.id);
        return authUser(verifiedUser ?? existingUser);
      }

      if (!isValidPassword(password)) return null;

      const { user } = await upsertDashboardAccount({
        provider: "email",
        providerAccountId: email,
        username: email.split("@")[0],
        email,
        emailVerifiedAt: new Date().toISOString(),
        passwordHash: await hashPassword(password),
      });

      return authUser(user);
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
        return Boolean(
          user?.id &&
          user.email &&
          (await findDashboardAccountById(user.id)),
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

      const existingUser =
        (await findDashboardAccountByProviderIdentity(
          provider,
          providerAccountId,
        )) ?? (await findDashboardAccountByEmail(email));
      const redirectTo = oauthPostLoginRedirect(existingUser);

      await upsertDashboardAccount({
        provider,
        providerAccountId,
        username,
        email,
      });
      return redirectTo === "/dashboard" ? true : redirectTo;
    },

    async jwt({ token, user, account }) {
      let databaseUser: DashboardAccount | null = null;

      if (
        account?.provider === "google" ||
        account?.provider === "github"
      ) {
        databaseUser = await findDashboardAccountByProviderIdentity(
          account.provider,
          account.providerAccountId,
        );

        if (!databaseUser && user.email) {
          databaseUser = await findDashboardAccountByEmail(user.email);
        }
      } else if (user?.id) {
        databaseUser = await findDashboardAccountById(user.id);
      } else if (token.sub) {
        databaseUser = await findDashboardAccountById(token.sub);
      }

      if (!databaseUser) {
        token.invalid = true;
        token.error = "stale_session";
        return token;
      }

      token.sub = databaseUser.id;
      token.name = databaseUser.github_username;
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
