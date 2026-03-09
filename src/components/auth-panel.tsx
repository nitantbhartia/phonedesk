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

  return (
    <div className="max-w-md rounded-[2rem] border border-white/60 bg-white/70 p-5 shadow-soft backdrop-blur-md">
      <div className="mb-4 flex rounded-full bg-paw-cream p-1 text-sm font-semibold">
        <button
          type="button"
          onClick={() => {
            setAuthMode("signup");
            setAuthError("");
          }}
          className={`flex-1 rounded-full px-4 py-2 transition-colors ${
            authMode === "signup" ? "bg-paw-brown text-paw-cream" : "text-paw-brown/70"
          }`}
        >
          Create account
        </button>
        <button
          type="button"
          onClick={() => {
            setAuthMode("signin");
            setAuthError("");
          }}
          className={`flex-1 rounded-full px-4 py-2 transition-colors ${
            authMode === "signin" ? "bg-paw-brown text-paw-cream" : "text-paw-brown/70"
          }`}
        >
          Sign in
        </button>
      </div>

      <form onSubmit={handleCredentialsAuth} className="space-y-3">
        {authMode === "signup" ? (
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Full name"
            className="w-full rounded-2xl border border-paw-brown/10 bg-white px-4 py-3 text-base outline-none transition focus:border-paw-orange"
          />
        ) : null}
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          className="w-full rounded-2xl border border-paw-brown/10 bg-white px-4 py-3 text-base outline-none transition focus:border-paw-orange"
          required
        />
        <input
          type="password"
          autoComplete={authMode === "signup" ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-2xl border border-paw-brown/10 bg-white px-4 py-3 text-base outline-none transition focus:border-paw-orange"
          minLength={8}
          required
        />

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-2xl bg-paw-brown px-5 py-3 font-bold text-paw-cream transition hover:bg-opacity-90 disabled:opacity-50"
        >
          {isSubmitting
            ? "Please wait..."
            : authMode === "signup"
              ? "Create account"
              : "Sign in with password"}
        </button>
      </form>

      <div className="my-4 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-paw-brown/40">
        <div className="h-px flex-1 bg-paw-brown/10" />
        <span>or</span>
        <div className="h-px flex-1 bg-paw-brown/10" />
      </div>

      <button
        type="button"
        onClick={handleGoogleAuth}
        disabled={isSubmitting}
        className="w-full rounded-2xl border border-paw-brown/10 bg-white px-5 py-3 font-semibold text-paw-brown transition hover:bg-paw-cream disabled:opacity-50"
      >
        Continue with Google
      </button>

      <p className="mt-3 text-xs leading-relaxed text-paw-brown/55">
        Use email and password if you do not want to sign in with Google.
      </p>

      {authError ? <p className="mt-3 text-sm text-red-600">{authError}</p> : null}
    </div>
  );
}
