"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Eye, EyeOff, Loader2, MailCheck } from "lucide-react";
import { AppDialog, FIELD_INPUT, FIELD_LABEL } from "@/components/ds/app-dialog";
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY } from "@/components/community-feed/feed-header";
import { useAuth } from "@/contexts/AuthContext";
import { resetPassword, signIn, signInWithGoogle, signUp } from "@/lib/auth";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { cn } from "@/lib/utils";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab: "signin" | "signup";
  redirectUrl?: string;
}

type View = "signin" | "signup" | "reset" | "check-inbox" | "reset-sent";

const MIN_PASSWORD = 8; // lib/auth-server.ts minPasswordLength

const TITLES: Record<View, { title: string; description: string }> = {
  signin: { title: "Welcome back", description: "Sign in to your Dance-Hub account." },
  signup: { title: "Create your account", description: "Join a community, or start your own." },
  reset: { title: "Reset your password", description: "We'll email you a link to choose a new one." },
  "check-inbox": { title: "Check your inbox", description: "One step left." },
  "reset-sent": { title: "Check your inbox", description: "The link is valid for a limited time." },
};

/** Server and network errors in plain words, shown under the form. */
export function friendlyAuthError(message: string | undefined): string {
  const m = message ?? "";
  if (/not (confirmed|verified)/i.test(m)) return "Confirm your email first. We sent you a link when you signed up.";
  if (/invalid (email or password|login credentials|password)|incorrect password/i.test(m)) return "Wrong email or password.";
  if (/already (exists|registered)|user exists/i.test(m)) return "An account with this email already exists. Sign in instead.";
  if (/password.*(too short|at least)/i.test(m)) return `Use at least ${MIN_PASSWORD} characters for your password.`;
  if (/failed to fetch|network/i.test(m)) return "Couldn't reach Dance-Hub. Check your connection and try again.";
  return m || "Something went wrong. Try again.";
}

function DHMark() {
  return (
    <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-[10px] bg-brand font-display text-[14px] font-bold tracking-tight text-white">
      DH
    </span>
  );
}

function GoogleLogo() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

export default function AuthModal({ isOpen, onClose, initialTab, redirectUrl: requestedRedirect }: AuthModalProps) {
  // The redirect can come from the URL (?redirect=), so only same-origin
  // paths are kept. Anything else is dropped and the default applies.
  const redirectUrl = safeRedirectPath(requestedRedirect) ?? undefined;
  const { refreshUser } = useAuth();
  const router = useRouter();
  const [view, setView] = useState<View>(initialTab);
  const [shownTab, setShownTab] = useState(initialTab);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState("");
  const ids = { email: useId(), password: useId(), first: useId(), last: useId(), pwHelp: useId(), error: useId() };

  // Opening the window on the other tab switches to it.
  if (initialTab !== shownTab) {
    setShownTab(initialTab);
    setView(initialTab);
  }

  // Store the redirect when the window opens with one.
  useEffect(() => {
    if (isOpen && redirectUrl) localStorage.setItem("auth_redirect_url", redirectUrl);
  }, [isOpen, redirectUrl]);

  const go = (next: View) => {
    setView(next);
    setError(null);
  };

  const handleClose = () => {
    setView(initialTab);
    setError(null);
    setEmail("");
    setPassword("");
    setFirstName("");
    setLastName("");
    setShowPassword(false);
    onClose();
  };

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      const fullRedirectUrl = redirectUrl ? `${window.location.origin}${redirectUrl}` : `${window.location.origin}/dashboard`;
      await signInWithGoogle(fullRedirectUrl);
      await refreshUser();
      // The browser goes to Google next; nothing to close here.
    } catch (err) {
      console.error("Google auth error:", err);
      setError("Couldn't continue with Google. Try again, or use your email.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);

    if (view === "signup") {
      if (!firstName.trim() || !lastName.trim()) {
        setError("Add your first and last name.");
        return;
      }
      if (password.length < MIN_PASSWORD) {
        setError(`Use at least ${MIN_PASSWORD} characters for your password.`);
        return;
      }
    }

    setLoading(true);
    try {
      if (view === "reset") {
        await resetPassword(email.trim());
        setSentTo(email.trim());
        setView("reset-sent");
      } else if (view === "signup") {
        // The redirect is used after the email is confirmed.
        await signUp(email.trim(), password, `${firstName.trim()} ${lastName.trim()}`, redirectUrl);
        await refreshUser();
        setSentTo(email.trim());
        setPassword("");
        setView("check-inbox");
      } else {
        await signIn(email.trim(), password);
        await refreshUser();
        toast.success("Signed in");
        handleClose();
        if (redirectUrl) router.push(redirectUrl);
      }
    } catch (err) {
      console.error("Auth error:", err);
      setError(friendlyAuthError(err instanceof Error ? err.message : undefined));
    } finally {
      setLoading(false);
    }
  };

  const errorBox = error && (
    <p id={ids.error} role="alert" className="rounded-[10px] bg-live-soft px-3 py-2.5 text-[13.5px] font-medium text-live">
      {error}
    </p>
  );

  const emailField = (
    <div>
      <label htmlFor={ids.email} className={FIELD_LABEL}>
        Email
      </label>
      <input
        id={ids.email}
        type="email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        className={FIELD_INPUT}
      />
    </div>
  );

  const { title, description } = TITLES[view];

  return (
    <AppDialog open={isOpen} onOpenChange={(o) => !o && handleClose()} title={title} description={description} leading={<DHMark />} width={460}>
      {(view === "signin" || view === "signup") && (
        <>
          <div role="tablist" aria-label="Sign in or sign up" className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
            {(["signin", "signup"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={view === t}
                onClick={() => go(t)}
                className={cn(
                  "h-9 rounded-[9px] text-[14px] font-semibold transition-colors",
                  view === t ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink"
                )}
              >
                {t === "signin" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>

          <button type="button" onClick={handleGoogleSignIn} disabled={loading} className={cn(BTN_SECONDARY, "h-11 w-full gap-2.5 text-[15px]")}>
            <GoogleLogo />
            Continue with Google
          </button>

          <div className="flex items-center gap-3 text-[13px] text-ink-3" aria-hidden="true">
            <span className="h-px flex-1 bg-line" />
            or with your email
            <span className="h-px flex-1 bg-line" />
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5" aria-describedby={error ? ids.error : undefined}>
            {view === "signup" && (
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <div>
                  <label htmlFor={ids.first} className={FIELD_LABEL}>
                    First name
                  </label>
                  <input
                    id={ids.first}
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    className={FIELD_INPUT}
                  />
                </div>
                <div>
                  <label htmlFor={ids.last} className={FIELD_LABEL}>
                    Last name
                  </label>
                  <input
                    id={ids.last}
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    className={FIELD_INPUT}
                  />
                </div>
              </div>
            )}
            {emailField}
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor={ids.password} className={FIELD_LABEL}>
                  Password
                </label>
                {view === "signin" && (
                  <button type="button" onClick={() => go("reset")} className="mb-1.5 text-[13px] font-semibold text-brand-ink hover:underline hover:underline-offset-[3px]">
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  id={ids.password}
                  type={showPassword ? "text" : "password"}
                  autoComplete={view === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  aria-describedby={view === "signup" ? ids.pwHelp : undefined}
                  className={cn(FIELD_INPUT, "pr-11")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
              {view === "signup" && (
                <p id={ids.pwHelp} className="mt-1.5 text-[12.5px] text-ink-3">
                  At least {MIN_PASSWORD} characters.
                </p>
              )}
            </div>
            {errorBox}
            <button type="submit" disabled={loading} className={cn(BTN_PRIMARY, "mt-1 h-11 w-full text-[15px]")}>
              {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
              {view === "signin" ? (loading ? "Signing in…" : "Sign in") : loading ? "Creating your account…" : "Create account"}
            </button>
          </form>
        </>
      )}

      {view === "reset" && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          {emailField}
          {errorBox}
          <button type="submit" disabled={loading} className={cn(BTN_PRIMARY, "h-11 w-full text-[15px]")}>
            {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
            {loading ? "Sending…" : "Send reset link"}
          </button>
          <button type="button" onClick={() => go("signin")} className={cn(BTN_GHOST, "self-center")}>
            Back to sign in
          </button>
        </form>
      )}

      {(view === "check-inbox" || view === "reset-sent") && (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <span aria-hidden="true" className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-soft text-brand-ink">
            <MailCheck className="h-7 w-7" />
          </span>
          {view === "check-inbox" ? (
            <>
              <p className="text-[15px] text-ink">
                We sent a confirmation link to <strong className="font-semibold">{sentTo}</strong>
              </p>
              <p className="max-w-[36ch] text-[14px] text-ink-2">Open it to finish creating your account. Nothing there? Check your spam folder.</p>
            </>
          ) : (
            <p className="max-w-[38ch] text-[15px] text-ink">If an account exists for {sentTo}, a reset link is on its way.</p>
          )}
          <button type="button" onClick={() => go("signin")} className={cn(BTN_SECONDARY, "mt-2")}>
            Back to sign in
          </button>
        </div>
      )}
    </AppDialog>
  );
}
