import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    invalid?: boolean;
    user: DefaultSession["user"] & {
      id: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    invalid?: boolean;
  }
}
