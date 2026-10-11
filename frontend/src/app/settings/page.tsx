import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ProfileLoadError } from "@/components/profile/profile-load-error";
import { SettingsPage } from "@/components/settings/settings-page";
import { loginPathFor } from "@/lib/auth-routing";
import { getCurrentUser, getUser, UserApiError } from "@/lib/getUser";

export const metadata: Metadata = {
  title: "Settings | Trivia Trap",
  description: "Manage your Trivia Trap account and profile settings.",
};

export default async function SettingsRoute() {
  let user;
  let account;
  try {
    [user, account] = await Promise.all([getUser({}), getCurrentUser()]);
    if (!account) redirect(loginPathFor("/settings"));
  } catch (error) {
    if (error instanceof UserApiError) {
      if (error.status === 401 || error.status === 403)
        redirect(loginPathFor("/settings"));
      return (
        <DashboardShell>
          <ProfileLoadError status={error.status} />
        </DashboardShell>
      );
    }
    throw error;
  }
  return (
    <DashboardShell user={user}>
      <SettingsPage user={user} email={account.email} />
    </DashboardShell>
  );
}
