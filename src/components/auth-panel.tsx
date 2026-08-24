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
    "w-full border border-line bg-paper px-3 py-2.5 text-[15px] text-ink outline-none placeholder:text-muted/70 focus:border-ink";

  return (
    <div className="w-full max-w-md border border-line bg-surface p-6">
      <div className="mb-5 flex border-b border-line text-[13px]">
        <button
          type="button"
          onClick={() => {
            setAuthMode("signup");
            setAuthError("");
          }}
          className={`-mb-px border-b px-1 pb-2.5 pr-5 transition-colors ${
            authMode === "signup" ? "border-accent text-ink" : "border-transparent text-muted"
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
          className={`-mb-px border-b px-1 pb-2.5 pr-5 transition-colors ${
            authMode === "signin" ? "border-accent text-ink" : "border-transparent text-muted"
          }`}
        >
          Log in
        </button>
      </div>

      <form onSubmit={handleCredentialsAuth} className="space-y-3">
        {authMode === "signup" ? (
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Full name"
            className={fieldClass}
          />
        ) : null}
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          className={fieldClass}
          required
        />
        <input
          type="password"
          autoComplete={authMode === "signup" ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className={fieldClass}
          minLength={8}
          required
        />

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-accent px-4 py-2.5 text-[13px] text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
        >
          {isSubmitting
            ? "Please wait..."
            : authMode === "signup"
              ? "Create account"
              : "Log in"}
        </button>
      </form>

      <div className="my-4 flex items-center gap-3 text-[11px] uppercase tracking-[0.16em] text-muted">
        <div className="h-px flex-1 bg-line" />
        <span>or</span>
        <div className="h-px flex-1 bg-line" />
      </div>

      <button
        type="button"
        onClick={handleGoogleAuth}
        disabled={isSubmitting}
        className="w-full border border-ink px-4 py-2.5 text-[13px] text-ink hover:bg-paper disabled:opacity-50"
      >
        Continue with Google
      </button>

      {authError ? <p className="mt-3 text-sm text-accent">{authError}</p> : null}
    </div>
  );
}
