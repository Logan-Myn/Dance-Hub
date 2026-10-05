"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Check, Eye, EyeOff, Link2Off, Loader2 } from "lucide-react";
import { MIN_PASSWORD, friendlyAuthError } from "@/components/auth/AuthModal";
import { FIELD_INPUT, FIELD_LABEL } from "@/components/ds/app-dialog";
import { BTN_GHOST, BTN_PRIMARY } from "@/components/community-feed/feed-header";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { cn } from "@/lib/utils";

type Step = "form" | "expired" | "done";

function Outcome({ icon, tone, title, children }: { icon: React.ReactNode; tone: "ok" | "warn"; title: string; children: React.ReactNode }) {
  // The form is replaced by this step, so focus moves to its heading and
  // screen readers announce it.
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span
        aria-hidden="true"
        className={cn("grid h-14 w-14 place-items-center rounded-2xl", tone === "ok" ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn")}
      >
        {icon}
      </span>
      <h1 ref={heading} tabIndex={-1} className="font-display text-[22px] font-semibold leading-tight text-ink outline-none">
        {title}
      </h1>
      {children}
    </div>
  );
}

export default function ResetPasswordForm({ token }: { token: string | null }) {
  const { user } = useAuth();
  const { showAuthModal } = useAuthModal();
  const [step, setStep] = useState<Step>(token ? "form" : "expired");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = { password: useId(), confirm: useId(), help: useId(), error: useId() };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setError(null);
    if (password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters for your password.`);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/auth/verify-reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (res.ok) {
        setStep("done");
        return;
      }
      const data: { error?: string } = await res.json().catch(() => ({}));
      if (/expired|invalid/i.test(data.error ?? "")) {
        setStep("expired");
        return;
      }
      setError(friendlyAuthError(data.error));
    } catch {
      setError(friendlyAuthError("Failed to fetch"));
    } finally {
      setSaving(false);
    }
  };

  if (step === "expired") {
    return (
      <Outcome icon={<Link2Off className="h-7 w-7" />} tone="warn" title="This link no longer works">
        <p className="max-w-[36ch] text-[15px] text-ink-2">
          Reset links work once, for a limited time. Ask for a new one and open the latest email.
        </p>
        <button type="button" onClick={() => showAuthModal("reset")} className={cn(BTN_PRIMARY, "mt-2 h-11 w-full text-[15px]")}>
          Send a new link
        </button>
        <Link href="/" className={BTN_GHOST}>
          Back to the homepage
        </Link>
      </Outcome>
    );
  }

  if (step === "done") {
    return (
      <Outcome icon={<Check className="h-7 w-7" />} tone="ok" title="Password changed">
        <p className="max-w-[36ch] text-[15px] text-ink-2">
          {user ? "Your new password is saved." : "Sign in with your new password to continue."}
        </p>
        {user ? (
          <Link href="/dashboard" className={cn(BTN_PRIMARY, "mt-2 h-11 w-full text-[15px]")}>
            Go to your dashboard
          </Link>
        ) : (
          <button type="button" onClick={() => showAuthModal("signin", "/dashboard")} className={cn(BTN_PRIMARY, "mt-2 h-11 w-full text-[15px]")}>
            Sign in
          </button>
        )}
      </Outcome>
    );
  }

  const eye = (
    <button
      type="button"
      onClick={() => setShowPassword((s) => !s)}
      aria-label={showPassword ? "Hide password" : "Show password"}
      aria-pressed={showPassword}
      className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink"
    >
      {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
    </button>
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3.5" aria-describedby={error ? ids.error : undefined}>
      <div className="mb-1">
        <h1 className="font-display text-[22px] font-semibold leading-tight text-ink">Choose a new password</h1>
        <p className="mt-1 text-[14.5px] text-ink-2">You&apos;ll use it to sign in to Dance-Hub from now on.</p>
      </div>
      <div>
        <label htmlFor={ids.password} className={FIELD_LABEL}>
          New password
        </label>
        <div className="relative">
          <input
            id={ids.password}
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
            aria-describedby={ids.help}
            className={cn(FIELD_INPUT, "pr-11")}
          />
          {eye}
        </div>
        <p id={ids.help} className="mt-1.5 text-[12.5px] text-ink-3">
          At least {MIN_PASSWORD} characters.
        </p>
      </div>
      <div>
        <label htmlFor={ids.confirm} className={FIELD_LABEL}>
          Confirm new password
        </label>
        <input
          id={ids.confirm}
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          className={FIELD_INPUT}
        />
      </div>
      {error && (
        <p id={ids.error} role="alert" className="rounded-[10px] bg-live-soft px-3 py-2.5 text-[13.5px] font-medium text-live">
          {error}
        </p>
      )}
      <button type="submit" disabled={saving} className={cn(BTN_PRIMARY, "mt-1 h-11 w-full text-[15px]")}>
        {saving && <Loader2 className="animate-spin" aria-hidden="true" />}
        {saving ? "Saving…" : "Save new password"}
      </button>
    </form>
  );
}
