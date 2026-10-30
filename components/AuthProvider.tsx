"use client";

import { SessionProvider } from "next-auth/react";

/**
 * Client-side session context. Wraps the whole app so `useSession`,
 * `signIn` and `signOut` work everywhere.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
