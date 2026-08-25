"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type AuthMode = "signin" | "signup";

export function AuthPanel({ initialMode = "signup" }: { initialMode?: AuthMode }) {
  const router = useRouter();
  const [authMode, setAuthMode] = useState<AuthMode>(initialMode);
  const [authError, setAuthError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  const handleGoogleAuth = () => {
    setAuthError("");
    setIsSubmitting(true);
    signIn("google", { callbackUrl: "/" }).catch(() => {
      setAuthError("Google sign-in failed. Check your auth configuration.");
      setIsSubmitting(false);
    });
  };

  const handleCredentialsAuth = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError("");
    setIsSubmitting(true);

    try {
      if (authMode === "signup") {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: fullName,
            email,
            password,
          }),
        });

        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data?.error || "Could not create your account.");
        }
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl: "/",
      });

      if (result?.error) {
        throw new Error("Email or password is incorrect.");
      }

      router.refresh();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Authentication failed.");
      setIsSubmitting(false);
    }
  };

  const fieldClass =
    "mt-2 w-full border-x-0 border-b border-t-0 border-line bg-transparent px-0 py-3 text-[15px] text-ink outline-none placeholder:text-muted/50 focus:border-ink";

  return (
    <div className="w-full max-w-md border-y border-line py-7 sm:py-8">
      <p className="mb-7 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Account ledger</p>
      <div className="mb-8 flex gap-6 border-b border-line text-[12px] tracking-[0.04em]">
        <button
          type="button"
          onClick={() => {
            setAuthMode("signup");
            setAuthError("");
          }}
          className={`-mb-px border-b pb-2.5 ${
            authMode === "signup" ? "border-ink text-ink" : "border-transparent text-muted"
          }`}
        >
          Sign up
        </button>
        <button
          type="button"
          onClick={() => {
            setAuthMode("signin");
            setAuthError("");
          }}
          className={`-mb-px border-b pb-2.5 ${
            authMode === "signin" ? "border-ink text-ink" : "border-transparent text-muted"
          }`}
        >
          Log in
        </button>
      </div>

      <form onSubmit={handleCredentialsAuth} className="space-y-5">
        {authMode === "signup" ? (
          <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Name</span>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={fieldClass}
              autoComplete="name"
            />
          </label>
        ) : null}
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldClass}
            required
          />
        </label>
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Password</span>
          <input
            type="password"
            autoComplete={authMode === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={fieldClass}
            minLength={8}
            required
          />
        </label>

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-2 w-full bg-accent px-4 py-2.5 text-[12px] tracking-[0.04em] text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
        >
          {isSubmitting ? "Please wait…" : authMode === "signup" ? "Sign the ledger" : "Open account"}
        </button>
      </form>

      <div className="my-6 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
        <div className="h-px flex-1 bg-line" />
        <span>or</span>
        <div className="h-px flex-1 bg-line" />
      </div>

      <button
        type="button"
        onClick={handleGoogleAuth}
        disabled={isSubmitting}
        className="w-full border border-line px-4 py-3 text-[12px] tracking-[0.04em] text-ink hover:bg-paper disabled:opacity-50"
      >
        Continue with Google
      </button>

      {authError ? <p className="mt-4 text-[13px] text-accent">{authError}</p> : null}
    </div>
  );
}
