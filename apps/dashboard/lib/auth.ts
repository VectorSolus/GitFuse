import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

import { upsertDashboardAccount } from "./account";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? ""
    })
  ],
  pages: {
    signIn: "/login"
  },
  callbacks: {
    async signIn({ profile }) {
      if (!profile) return false;
      const githubId = String(profile.id ?? "");
      const githubUsername = String(profile.login ?? profile.name ?? "");
      const email = String(profile.email ?? `${githubUsername || githubId}@users.noreply.github.com`);

      if (!githubId || !githubUsername) return false;

      await upsertDashboardAccount({ githubId, githubUsername, email });
      return true;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.name = token.name ?? session.user.name;
        session.user.email = token.email ?? session.user.email;
      }
      return session;
    }
  }
});
