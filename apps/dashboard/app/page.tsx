import { redirect } from "next/navigation";
import { createElement } from "react";

import { auth } from "../lib/auth";

import { HomePageClient } from "./home-page-client";

export default async function HomePage() {
  const session = await auth().catch(() => null);

  if (session?.user && !session.invalid) {
    redirect("/dashboard");
  }

  return createElement(HomePageClient);
}
