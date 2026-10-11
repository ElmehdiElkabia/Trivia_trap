"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  KeyRound,
  LoaderCircle,
  LogOut,
  Mail,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { EditProfileDialog } from "@/components/profile/edit-profile-dialog";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch, apiMediaUrl } from "@/lib/api";
import { loginPathFor } from "@/lib/auth-routing";
import { logoutSession } from "@/lib/session-actions";
import type { UserData } from "@/types/userData";

async function responseMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  if (body && typeof body === "object") {
    if ("message" in body && typeof body.message === "string")
      return body.message;
    if ("detail" in body && typeof body.detail === "string") return body.detail;
    if ("detail" in body && Array.isArray(body.detail)) {
      const messages = body.detail.flatMap((item) => {
        if (!item || typeof item !== "object" || !("msg" in item)) return [];
        return typeof item.msg === "string" ? [item.msg] : [];
      });
      if (messages.length > 0) return messages.join(" ");
    }
  }
  return fallback;
}

type AccountErrors = Partial<Record<"username" | "email", string>>;

type UpdatedProfileResponse = Omit<UserData, "join_date"> & {
  joined_date: string;
};

function validateAccount(username: string, email: string): AccountErrors {
  const errors: AccountErrors = {};
  if (!username) errors.username = "Username is required.";
  else if (username.length > 15)
    errors.username = "Username must be 15 characters or fewer.";

  if (!email) errors.email = "Email is required.";
  else if (email.length < 5 || email.length > 30)
    errors.email = "Email must be between 5 and 30 characters.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors.email = "Enter a valid email address.";
  return errors;
}

function SettingsCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof UserRound;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="rounded-[20px] border-white/[0.07] bg-trap-surface shadow-[0_16px_36px_rgba(0,0,0,0.14)]">
      <CardHeader className="flex-row items-start gap-3 border-b border-white/[0.06] pb-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-secondary/20 bg-secondary/10 text-[#9295ff]">
          <Icon className="size-4" />
        </span>
        <div>
          <CardTitle className="font-secondary text-base uppercase text-white">
            {title}
          </CardTitle>
          <p className="mt-1 text-xs leading-5 text-[#a6a6ae]">{description}</p>
        </div>
      </CardHeader>
      <CardContent className="p-5 sm:p-6">{children}</CardContent>
    </Card>
  );
}

export function SettingsPage({
  user,
  email,
}: {
  user: UserData;
  email: string;
}) {
  const router = useRouter();
  const [updatedUser, setUpdatedUser] = useState<UserData | null>(null);
  const displayedUser = updatedUser ?? user;
  const [username, setUsername] = useState(user.username);
  const [accountEmail, setAccountEmail] = useState(email);
  const [savedEmail, setSavedEmail] = useState(email);
  const [accountErrors, setAccountErrors] = useState<AccountErrors>({});
  const [accountError, setAccountError] = useState("");
  const [accountSuccess, setAccountSuccess] = useState("");
  const [savingAccount, setSavingAccount] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState("");
  const [resetError, setResetError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  async function updateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingAccount) return;

    const nextUsername = username.trim();
    const nextEmail = accountEmail.trim();
    const validationErrors = validateAccount(nextUsername, nextEmail);
    setAccountErrors(validationErrors);
    setAccountError("");
    setAccountSuccess("");
    if (Object.keys(validationErrors).length > 0) return;

    setSavingAccount(true);
    try {
      const form = new FormData();
      form.append("username", nextUsername);
      form.append("email", nextEmail);
      const response = await apiFetch("/users/me", {
        method: "PUT",
        body: form,
      });
      const message = await responseMessage(
        response.clone(),
        "Could not update your account.",
      );
      if (response.status === 401 || response.status === 403) {
        window.location.assign(loginPathFor("/settings"));
        return;
      }
      if (!response.ok) throw new Error(message);

      const profile = await response.json() as UpdatedProfileResponse;
      const nextUser: UserData = {
        ...profile,
        avatar: apiMediaUrl(profile.avatar) ?? null,
        banner: apiMediaUrl(profile.banner) ?? null,
        join_date: new Date(profile.joined_date),
      };
      setUpdatedUser(nextUser);
      setUsername(nextUser.username);
      setAccountEmail(nextEmail);
      setSavedEmail(nextEmail);
      setAccountSuccess("Account details updated successfully.");
      router.refresh();
    } catch (error) {
      setAccountError(
        error instanceof Error
          ? error.message
          : "Could not update your account.",
      );
    } finally {
      setSavingAccount(false);
    }
  }

  async function requestPasswordReset(event: FormEvent) {
    event.preventDefault();
    if (resetting) return;
    setResetting(true);
    setResetMessage("");
    setResetError("");
    try {
      const response = await apiFetch("/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: savedEmail }),
      });
      const message = await responseMessage(
        response,
        "Could not request a password reset.",
      );
      if (!response.ok) throw new Error(message);
      setResetMessage(message);
    } catch (error) {
      setResetError(
        error instanceof Error
          ? error.message
          : "Could not request a password reset.",
      );
    } finally {
      setResetting(false);
    }
  }

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError("");
    try {
      await logoutSession();
      window.location.replace("/login");
    } catch (error) {
      setLogoutError(
        error instanceof Error ? error.message : "Could not log out.",
      );
      setLoggingOut(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">
          Account control
        </p>
        <h1 className="mt-2 font-secondary text-3xl uppercase text-white sm:text-4xl">
          Settings
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Manage the account options currently supported by Trivia Trap.
        </p>
      </header>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <SettingsCard
          icon={UserRound}
          title="Account"
          description="Your authenticated account identity."
        >
          <form className="space-y-4" onSubmit={updateAccount} noValidate aria-busy={savingAccount}>
            <div>
              <label
                htmlFor="settings-username"
                className="mb-2 block text-xs font-bold text-[#d8d8dd]"
              >
                Username
              </label>
              <Input
                id="settings-username"
                name="username"
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value);
                  setAccountErrors((current) => ({ ...current, username: undefined }));
                  setAccountError("");
                  setAccountSuccess("");
                }}
                minLength={1}
                maxLength={15}
                required
                autoComplete="username"
                disabled={savingAccount}
                invalid={Boolean(accountErrors.username)}
                aria-describedby={accountErrors.username ? "settings-username-error" : undefined}
              />
              {accountErrors.username ? (
                <p id="settings-username-error" className="mt-2 text-xs text-trap-danger">
                  {accountErrors.username}
                </p>
              ) : null}
            </div>
            <div>
              <label
                htmlFor="settings-email"
                className="mb-2 block text-xs font-bold text-[#d8d8dd]"
              >
                Email address
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#777782]" />
                <Input
                  id="settings-email"
                  name="email"
                  type="email"
                  value={accountEmail}
                  onChange={(event) => {
                    setAccountEmail(event.target.value);
                    setAccountErrors((current) => ({ ...current, email: undefined }));
                    setAccountError("");
                    setAccountSuccess("");
                  }}
                  minLength={5}
                  maxLength={30}
                  required
                  autoComplete="email"
                  disabled={savingAccount}
                  invalid={Boolean(accountErrors.email)}
                  aria-describedby={accountErrors.email ? "settings-email-error" : undefined}
                  className="pl-11"
                />
              </div>
              {accountErrors.email ? (
                <p id="settings-email-error" className="mt-2 text-xs text-trap-danger">
                  {accountErrors.email}
                </p>
              ) : null}
            </div>
            <Button
              type="submit"
              disabled={
                savingAccount ||
                (username.trim() === displayedUser.username &&
                  accountEmail.trim() === savedEmail)
              }
            >
              {savingAccount ? <LoaderCircle className="size-4 animate-spin" /> : <UserRound className="size-4" />}
              {savingAccount ? "Saving…" : "Save account details"}
            </Button>
            {accountSuccess ? (
              <p role="status" className="rounded-xl border border-trap-success/20 bg-trap-success/10 px-3 py-2 text-xs text-trap-success">
                {accountSuccess}
              </p>
            ) : null}
            {accountError ? (
              <p role="alert" className="rounded-xl border border-trap-danger/20 bg-trap-danger/10 px-3 py-2 text-xs text-trap-danger">
                {accountError}
              </p>
            ) : null}
          </form>
        </SettingsCard>

        <SettingsCard
          icon={Camera}
          title="Profile"
          description="Choose the avatar shown on your profile, dashboard, and game surfaces."
        >
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/[0.07] bg-black/10 p-4 text-center sm:flex-row sm:text-left">
            <ProfileAvatar
              name={displayedUser.username}
              imageUrl={displayedUser.avatar}
              size={96}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-extrabold text-white">
                {displayedUser.username}
              </p>
              <p className="mt-1 text-xs leading-5 text-[#85858f]">
                Use a generated avatar or upload JPEG, PNG, or WebP up to 5 MB.
              </p>
              <Button
                type="button"
                variant="surface"
                size="sm"
                className="mt-3"
                onClick={() => setAvatarOpen(true)}
              >
                <Camera className="size-4" /> Change avatar
              </Button>
            </div>
          </div>
        </SettingsCard>

        <SettingsCard
          icon={ShieldCheck}
          title="Security"
          description="Reset your password through the existing secure, single-use email flow."
        >
          <form onSubmit={requestPasswordReset}>
            <p className="text-xs leading-5 text-[#a6a6ae]">
              We’ll send password-reset instructions to{" "}
              <span className="font-bold text-white">{savedEmail}</span> when this
              account is eligible and mail delivery is configured.
            </p>
            <Button
              type="submit"
              variant="surface"
              className="mt-4"
              disabled={resetting}
            >
              {resetting ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <KeyRound className="size-4" />
              )}
              {resetting ? "Requesting…" : "Send password reset link"}
            </Button>
            {resetMessage ? (
              <p
                role="status"
                className="mt-3 rounded-xl border border-trap-success/20 bg-trap-success/10 px-3 py-2 text-xs text-trap-success"
              >
                {resetMessage}
              </p>
            ) : null}
            {resetError ? (
              <p
                role="alert"
                className="mt-3 rounded-xl border border-trap-danger/20 bg-trap-danger/10 px-3 py-2 text-xs text-trap-danger"
              >
                {resetError}
              </p>
            ) : null}
          </form>
        </SettingsCard>

        <SettingsCard
          icon={LogOut}
          title="Account actions"
          description="End your current authenticated session on this device."
        >
          <Button
            type="button"
            variant="destructive"
            disabled={loggingOut}
            onClick={logout}
          >
            {loggingOut ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <LogOut className="size-4" />
            )}
            {loggingOut ? "Logging out…" : "Log out"}
          </Button>
          {logoutError ? (
            <p role="alert" className="mt-3 text-xs text-trap-danger">
              {logoutError}
            </p>
          ) : null}
        </SettingsCard>
      </div>

      <EditProfileDialog
        open={avatarOpen}
        onOpenChange={setAvatarOpen}
        user={displayedUser}
        authReturnPath="/settings"
      />
    </div>
  );
}
