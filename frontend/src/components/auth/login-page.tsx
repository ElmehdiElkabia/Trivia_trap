"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  ArrowLeft,
  LoaderCircle,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Sparkles,
  Zap,
} from "lucide-react";

import { GoogleSignIn } from "@/components/auth/google-sign-in";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { apiFetch } from "@/lib/api";

type Mode = "login" | "register" | "reset" | "new-password";

type ValidationIssue = { loc?: (string | number)[]; type?: string; msg?: string };

function authValidationMessage(detail: unknown, mode: "login" | "register"): string {
  if (!Array.isArray(detail)) return "Please check your details.";

  const fields = mode === "register" ? ["username", "email", "password"] : ["email", "password"];
  for (const field of fields) {
    const issue = detail.find((entry: ValidationIssue) =>
      entry && Array.isArray(entry.loc) && entry.loc[entry.loc.length - 1] === field
    ) as ValidationIssue | undefined;
    if (!issue) continue;

    if (field === "username") {
      if (issue.type === "missing") return "Enter a username.";
      if (issue.type === "string_too_short") return "Username must be at least 3 characters.";
      if (issue.type === "string_too_long") return "Username must be at most 15 characters.";
      return issue.msg?.replace(/^Value error, /, "") ?? "Check your username.";
    }
    if (field === "email") return "Enter a valid email address.";
    if (issue.type === "missing") return "Enter a password.";
    if (issue.type === "too_short" || issue.type === "string_too_short") {
      return mode === "login" ? "Enter your password." : "Password must be at least 7 characters.";
    }
    if (issue.type === "too_long" || issue.type === "string_too_long") return "Password must be at most 128 characters.";
    return issue.msg?.replace(/^Value error, /, "") ?? "Check your password.";
  }

  return "Please check your details.";
}

export function LoginPage({ initialMode = "login", initialMessage = "" }: { initialMode?: Mode; initialMessage?: string }) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(initialMessage);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const requestInFlight = useRef(false);
  const resetToken = useRef("");
  const createsPassword = mode === "register" || mode === "new-password";

  useEffect(() => {
    if (initialMode !== "new-password") return;
    function captureToken() {
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      // Keep the token only in memory, and preserve it across Strict Mode effects.
      if (fragment.has("token")) {
        resetToken.current = fragment.get("token") ?? "";
        window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
      }
    }
    captureToken();
    window.addEventListener("hashchange", captureToken);
    return () => window.removeEventListener("hashchange", captureToken);
  }, [initialMode]);

  const finishSignIn = useCallback(async () => {
    // Remove tokens left by the previous Local Storage implementation.
    localStorage.removeItem("access_token");
    sessionStorage.removeItem("google_signup_credential");
    const session = await apiFetch("/auth/me");
    if (!session.ok) {
      setMessage("Sign-in succeeded, but the browser could not save your session. Check that the site and API use the same hostname.");
      return;
    }
    router.replace("/dashboard");
  }, [router]);

  const handleGoogleCredential = useCallback(async (credential: string) => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setPending(true);
    setMessage("");
    try {
      const response = await apiFetch("/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      if (!response.ok) {
        if (response.status === 409) {
          setMessage("An account with this email already exists. Sign in with your existing method.");
        } else if (response.status === 401 || response.status === 422) {
          setMessage("Google could not verify your sign-in. Please try again.");
        } else {
          setMessage("Google sign-in is temporarily unavailable. Please try again or use email.");
        }
        return;
      }
      const data = (await response.json()) as { requires_username?: boolean; access_token?: string; token_type?: string };
      if (data.requires_username === true) {
        sessionStorage.setItem("google_signup_credential", credential);
        router.replace("/choose-username");
        return;
      }
      if (!data.access_token || data.token_type !== "bearer") {
        setMessage("The server did not return a valid login session. Please try again.");
        return;
      }
      await finishSignIn();
    } catch {
      setMessage("Could not complete Google sign-in. Please try again in a moment.");
    } finally {
      requestInFlight.current = false;
      setPending(false);
    }
  }, [finishSignIn, router]);

  function changeMode(next: Mode, afterRequest = false) {
    if (pending && !afterRequest) return;
    setMode(next);
    setMessage("");
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestInFlight.current) return;
    setMessage("");

    if (createsPassword && password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    if (mode === "new-password" && !/^[A-Za-z0-9_-]{43}$/.test(resetToken.current)) {
      setMessage("This reset link is missing or invalid. Please request a new link.");
      return;
    }

    requestInFlight.current = true;
    setPending(true);
    const route = mode === "login" ? "/auth/login" : mode === "register" ? "/auth/register" : mode === "new-password" ? "/auth/reset-password" : "/auth/forgot-password";
    const body = mode === "new-password" ? { token: resetToken.current, password } : mode === "reset" ? { email } : mode === "register" ? { email, username, password } : { email, password };

    try {
      const response = await apiFetch(route, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        if (mode === "new-password") {
          if (response.status === 400) {
            setMessage("This reset link has expired or has already been used. Please request a new link.");
          } else if (response.status === 422) {
            const data = await response.json() as { detail?: { loc?: string[]; msg?: string }[] };
            const errors = Array.isArray(data.detail)
              ? data.detail.filter(error => error.loc?.includes("password") && typeof error.msg === "string")
              : [];
            setMessage(errors.length
              ? errors.map(error => error.msg!.replace(/^Value error, /, "")).join(" ")
              : "This reset link is invalid. Please request a new link.");
          } else {
            setMessage("Could not reset your password. Please try again in a moment.");
          }
          return;
        }
        if (mode === "reset" && response.status !== 404 && response.status < 500) {
          setMessage("If that email has an account, a reset link is on its way.");
          return;
        }
        if ((mode === "login" || mode === "register") && response.status === 422) {
          const data = await response.json() as { detail?: unknown };
          setMessage(authValidationMessage(data.detail, mode));
          return;
        }
        if (mode === "register" && response.status === 409) {
          const data = await response.json() as { detail?: unknown };
          setMessage(typeof data.detail === "string" ? data.detail : "This username or email is already registered.");
          return;
        }
        let detail = "Something went wrong. Please try again.";
        if (mode === "login" && response.status === 409) detail = "This account uses Google sign-in. Select Continue with Google above.";
        else if (mode === "login" && response.status === 401) detail = "Incorrect email or password.";
        else if (response.status === 401 || response.status === 400) detail = "Check your details and try again.";
        else if (response.status === 409) detail = "That account already exists. Try signing in.";
        else if (response.status === 404) detail = "This sign-in option is not available yet.";
        setMessage(detail);
        return;
      }

      if (mode === "new-password") {
        resetToken.current = "";
        setPassword("");
        setConfirmPassword("");
        window.location.replace("/login?passwordReset=success");
      } else if (mode === "login") {
        const data = (await response.json()) as { access_token?: string; token_type?: string };
        if (!data.access_token || data.token_type !== "bearer") {
          setMessage("The server did not return a valid login session. Please try again.");
          return;
        }
        await finishSignIn();
      } else if (mode === "register") {
        changeMode("login", true);
        setMessage("Account created. You can sign in now.");
      } else {
        setMessage("If that email has an account, a reset link is on its way.");
      }
    } catch {
      setMessage("Could not connect. Please try again in a moment.");
    } finally {
      requestInFlight.current = false;
      setPending(false);
    }
  }

  const heading = mode === "login" ? "Welcome back." : mode === "register" ? "Join the game." : mode === "new-password" ? "Choose a new password." : "Reset your password.";
  const subtitle = mode === "login" ? "Sign in to your account and make your next move." : mode === "register" ? "Create an account. The room is waiting for you." : mode === "new-password" ? "Enter and confirm your new password to get back in the game." : "Enter your email and we’ll send you a reset link.";

  return (
    <main className="relative isolate min-h-svh overflow-x-hidden bg-trap-canvas text-foreground">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_50%_42%,rgba(255,107,53,.10),transparent_26%),radial-gradient(ellipse_at_8%_88%,rgba(91,95,239,.18),transparent_38%),radial-gradient(ellipse_at_94%_8%,rgba(255,107,53,.12),transparent_36%)]" />
      <div aria-hidden="true" className="landing-grid pointer-events-none fixed inset-0 -z-10 opacity-45 [mask-image:radial-gradient(ellipse_at_center,black,transparent_78%)]" />
      <div aria-hidden="true" className="pointer-events-none fixed left-[7%] top-[22%] -z-10 hidden select-none font-secondary text-[19rem] leading-none text-white/[.022] xl:block">?</div>
      <div aria-hidden="true" className="pointer-events-none fixed bottom-[5%] right-[7%] -z-10 hidden rotate-12 select-none font-secondary text-[16rem] leading-none text-primary/[.035] xl:block">?</div>
      <div aria-hidden="true" className="pointer-events-none fixed left-[18%] top-[20%] -z-10 size-2 rounded-full bg-trap-secondary-soft/30 shadow-[0_0_24px_6px_rgba(192,193,255,.12)]" />
      <div aria-hidden="true" className="pointer-events-none fixed bottom-[18%] right-[18%] -z-10 size-2 rounded-full bg-primary/40 shadow-[0_0_24px_6px_rgba(255,107,53,.14)]" />

      <div className="mx-auto min-h-svh max-w-[1360px] px-5 sm:px-10 lg:px-16">
        <motion.header
          initial={{ opacity: 0, y: reducedMotion ? 0 : -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reducedMotion ? 0.01 : 0.45 }}
          className="absolute inset-x-0 top-0 z-10 mx-auto flex max-w-[1360px] items-center justify-between gap-4 px-5 py-6 sm:px-10 sm:py-8 lg:px-16"
        >
          <Link href="/" className="inline-flex items-center gap-2.5 text-sm font-black tracking-wide text-primary sm:text-base" aria-label="Trivia Trap home">
            <span className="grid size-9 place-items-center rounded-xl border border-primary/30 bg-primary/10 text-primary"><Zap size={20} fill="currentColor" aria-hidden="true" /></span>
            <span>TRIVIA TRAP</span>
          </Link>
          <Button asChild variant="ghost" size="sm" className="gap-2 text-trap-text-dim"><Link href="/"><ArrowLeft size={14} /> Back to home</Link></Button>
        </motion.header>

        <div className="flex min-h-svh items-center justify-center py-28 sm:py-32">
          <motion.section
            initial={{ opacity: 0, y: reducedMotion ? 0 : 22, scale: reducedMotion ? 1 : 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: reducedMotion ? 0.01 : 0.55, delay: reducedMotion ? 0 : 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto w-full min-w-0 max-w-[460px]"
            aria-labelledby="auth-heading"
          >
            <div className="mb-5 text-center font-secondary text-2xl font-black leading-none tracking-[-.02em] sm:text-3xl">
              <div className="text-[#f5f3ef]">Know the answer.</div>
              <div className="text-primary">Bluff the room.</div>
            </div>
            <motion.div
              layout
              transition={{ layout: { duration: reducedMotion ? 0.01 : 0.36, ease: [0.22, 1, 0.36, 1] } }}
              className="relative"
            >
              <div aria-hidden="true" className="absolute -inset-8 -z-10 rounded-[40px] bg-[radial-gradient(circle_at_top,rgba(255,107,53,.13),transparent_58%)] blur-xl" />
              <Card className="relative overflow-hidden rounded-[28px] border-white/10 bg-trap-panel/95 p-6 shadow-[0_32px_100px_-38px_rgba(0,0,0,.95),0_0_0_1px_rgba(255,255,255,.02)] backdrop-blur-xl sm:p-9">
                <div aria-hidden="true" className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
                {(mode === "login" || mode === "register") ? (
                  <div className="mb-8 grid grid-cols-2 gap-1 rounded-xl border border-white/5 bg-trap-canvas p-1" role="group" aria-label="Account options">
                    {(["login", "register"] as const).map(option => <Button key={option} type="button" variant="ghost" size="sm" disabled={pending} aria-pressed={mode === option} onClick={() => changeMode(option)} className={`rounded-lg tracking-normal ${mode === option ? "bg-trap-muted text-white shadow-sm hover:bg-trap-muted" : "text-trap-text-dim"}`}>{option === "login" ? "Sign in" : "Create account"}</Button>)}
                  </div>
                ) : <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => changeMode("login")} className="mb-5 -ml-3 text-trap-text-dim"><ArrowLeft size={14} /> Back to sign in</Button>}

                <AnimatePresence initial={false} mode="wait">
                  <motion.div
                    key={mode}
                    initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                    transition={{ duration: reducedMotion ? 0.01 : 0.22, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <div className="mb-7">
                      <h1 id="auth-heading" className="text-[30px] font-extrabold leading-tight tracking-[-.045em]">{heading}</h1>
                      <p className="mt-2 text-sm leading-6 text-trap-text-dim">{subtitle}</p>
                    </div>

                    {(mode === "login" || mode === "register") && <>
                      <GoogleSignIn disabled={pending} onCredential={handleGoogleCredential} />
                      <div className="my-6 flex items-center gap-4 text-[11px] text-trap-text-dim"><span className="h-px flex-1 bg-border" /> or use your email <span className="h-px flex-1 bg-border" /></div>
                    </>}

                    <form onSubmit={handleSubmit} noValidate={mode === "login" || mode === "register"} aria-busy={pending}>
                      <fieldset disabled={pending} className="min-w-0 space-y-4">
                        {mode === "register" && <div>
                          <label htmlFor="username" className="mb-2 block text-xs font-bold text-trap-text-soft">Player name</label>
                          <div className="relative"><Input id="username" name="username" required minLength={3} maxLength={15} autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} placeholder="Your alter ego" className="pl-11" /><Sparkles size={16} className="auth-input-icon" aria-hidden="true" /></div>
                        </div>}
                        {mode !== "new-password" && <div>
                          <label htmlFor="email" className="mb-2 block text-xs font-bold text-trap-text-soft">Email address</label>
                          <div className="relative"><Input id="email" name="email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className="pl-11" /><Mail size={16} className="auth-input-icon" aria-hidden="true" /></div>
                        </div>}
                        {mode !== "reset" && <div>
                          <div className="mb-2 flex items-center justify-between gap-3"><label htmlFor="password" className="text-xs font-bold text-trap-text-soft">Password</label>{mode === "login" && <button type="button" onClick={() => changeMode("reset")} className="text-xs font-semibold text-trap-text-dim transition hover:text-trap-primary-soft">Forgot password?</button>}</div>
                          <div className="relative"><Input id="password" name="password" type={showPassword ? "text" : "password"} required minLength={createsPassword ? 7 : undefined} maxLength={createsPassword ? 128 : undefined} autoComplete={createsPassword ? "new-password" : "current-password"} aria-describedby={createsPassword ? "password-help" : undefined} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" className="pl-11 pr-12" /><LockKeyhole size={16} className="auth-input-icon" aria-hidden="true" /><Button type="button" variant="ghost" size="icon-sm" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} className="absolute right-2 top-1/2 -translate-y-1/2 text-trap-text-dim">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</Button></div>
                          {createsPassword && <p id="password-help" className="mt-2 text-[11px] leading-5 text-trap-text-dim">7–128 characters with uppercase, lowercase, a number and a symbol; no spaces.</p>}
                        </div>}
                        {createsPassword && <div>
                          <label htmlFor="confirm-password" className="mb-2 block text-xs font-bold text-trap-text-soft">Confirm password</label>
                          <div className="relative"><Input id="confirm-password" name="confirm-password" type={showPassword ? "text" : "password"} required autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="One more time" className="pl-11" /><LockKeyhole size={16} className="auth-input-icon" aria-hidden="true" /></div>
                        </div>}
                        {message && <p role="status" aria-live="polite" className={`rounded-xl border px-3 py-2.5 text-sm leading-5 ${message.startsWith("If ") || message.startsWith("Account created") || message.startsWith("Password reset.") ? "border-trap-success/30 bg-trap-success/10 text-trap-success" : "border-trap-danger/30 bg-trap-danger/10 text-[#ffd0c5]"}`}>{message}</p>}
                        <Button type="submit" disabled={pending} size="lg" className="mt-2 h-[52px] w-full justify-between px-5 text-sm tracking-normal">
                          {pending ? "Please wait…" : mode === "login" ? "Let’s play" : mode === "register" ? "Create account" : mode === "new-password" ? "Update password" : "Send reset link"}
                          {pending ? <LoaderCircle size={18} className="motion-safe:animate-spin" aria-hidden="true" /> : <ArrowRight size={18} aria-hidden="true" />}
                        </Button>
                      </fieldset>
                    </form>

                    {mode === "new-password" && <Button type="button" variant="ghost" disabled={pending} onClick={() => changeMode("reset")} className="mt-4 w-full text-trap-text-dim">Request a new reset link</Button>}

                    <div className="mt-7 border-t border-border pt-5 text-center text-xs leading-6 text-trap-text-dim">
                      {mode === "login" ? <>New to the trap? <button type="button" disabled={pending} onClick={() => changeMode("register")} className="font-bold text-trap-primary-soft hover:text-white disabled:opacity-50">Join the fun <span aria-hidden="true">↗</span></button></> : <>Already part of the party? <button type="button" disabled={pending} onClick={() => changeMode("login")} className="font-bold text-trap-primary-soft hover:text-white disabled:opacity-50">Sign in <span aria-hidden="true">↗</span></button></>}
                    </div>
                    <p className="mt-4 text-center text-[11px] leading-5 text-trap-text-dim">See how Trivia Trap uses your data in our <Link href="/privacy" className="font-semibold text-trap-primary-soft underline underline-offset-2 hover:text-white">Privacy Policy</Link>.</p>
                  </motion.div>
                </AnimatePresence>
              </Card>
            </motion.div>
          </motion.section>
        </div>
      </div>
    </main>
  );
}
