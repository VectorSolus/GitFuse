import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

import { upsertDashboardAccount } from "./account";
import { normalizeEmail, verifyOtpChallenge } from "./otp";

const githubClientId = process.env.GITHUB_CLIENT_ID?.trim();
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();

const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

const authSecret =
  process.env.AUTH_SECRET?.trim() ?? process.env.NEXTAUTH_SECRET?.trim();

if (!authSecret) {
  throw new Error("AUTH_SECRET or NEXTAUTH_SECRET is required");
}

const providers = [
  ...(githubClientId && githubClientSecret
    ? [
        GitHub({
          clientId: githubClientId,
          clientSecret: githubClientSecret,
        }),
      ]
    : []),

  ...(googleClientId && googleClientSecret
    ? [
        Google({
          clientId: googleClientId,
          clientSecret: googleClientSecret,
        }),
      ]
    : []),

  Credentials({
    name: "Email OTP",
    credentials: {
      email: { label: "Email", type: "email" },
      otp: { label: "OTP", type: "text" },
    },
    async authorize(credentials) {
      const email = normalizeEmail(String(credentials?.email ?? ""));
      const otp = String(credentials?.otp ?? "");

      const verification = await verifyOtpChallenge(email, otp);

      if (!verification.ok) {
        return null;
      }

      const { user } = await upsertDashboardAccount({
        providerAccountId: `email:${email}`,
        username: email.split("@")[0],
        email,
      });

      return {
        id: user.id,
        name: user.github_username,
        email: user.email,
      };
    },
  }),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: authSecret,

  trustHost: true,

  providers,

  pages: {
    signIn: "/login",
  },

  callbacks: {
    async signIn({ account, profile, user }) {
      if (account?.provider === "credentials") {
        return Boolean(user?.email);
      }

      if (!account?.provider || !profile) {
        return false;
      }

      const profileRecord = profile as Record<string, unknown>;

      if (account.provider === "google") {
        const googleId = String(profileRecord.sub ?? "");
        const email = String(profileRecord.email ?? "");
        const username = String(
          profileRecord.name ?? email.split("@")[0] ?? "",
        );

        if (!googleId || !email) {
          return false;
        }

        await upsertDashboardAccount({
          providerAccountId: `google:${googleId}`,
          username,
          email,
        });

        return true;
      }

      if (account.provider === "github") {
        const githubId = String(profileRecord.id ?? "");
        const githubUsername = String(
          profileRecord.login ?? profileRecord.name ?? "",
        );

        const email = String(
          profileRecord.email ??
            `${githubUsername || githubId}@users.noreply.github.com`,
        );

        if (!githubId || !githubUsername) {
          return false;
        }

        await upsertDashboardAccount({
          providerAccountId: `github:${githubId}`,
          githubId: `github:${githubId}`,
          githubUsername,
          username: githubUsername,
          email,
        });

        return true;
      }

      return false;
    },

    async jwt({ token, user }) {
      if (user) {
        token.name = user.name;
        token.email = user.email;
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.name = token.name ?? session.user.name;
        session.user.email = token.email ?? session.user.email;
      }

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
