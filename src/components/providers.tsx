"use client";

import { SessionProvider } from "next-auth/react";
import { type ReactNode } from "react";
import { Toaster } from "@/components/ui/toast";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <Toaster />
    </SessionProvider>
  );
}
