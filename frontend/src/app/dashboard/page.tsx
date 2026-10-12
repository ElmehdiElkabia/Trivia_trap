import type { Metadata } from "next";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { AvailableRooms } from "@/components/dashboard/available-rooms";
import { FriendsOnline } from "@/components/dashboard/friends-online";
import { QuickStats } from "@/components/dashboard/quick-stats";
import { RecentGames } from "@/components/dashboard/recent-games";
import { getUser, UserApiError } from "@/lib/getUser";
import { loginPathFor } from "@/lib/auth-routing";
import { redirect } from "next/navigation";
import { ProfileLoadError } from "@/components/profile/profile-load-error";
import { getGameHistory } from "@/lib/game-history";

export const metadata: Metadata = {
  title: "Dashboard | Trivia Trap",
  description: "Your Trivia Trap games, friends, and scores.",
};

export default async function DashboardPage() {
  let user;
  let history = null;
  try {
    user = await getUser({});
  } catch (error) {
    if (error instanceof UserApiError) {
      if (error.status === 401) redirect(loginPathFor("/dashboard"));
      return <DashboardShell><ProfileLoadError status={error.status} /></DashboardShell>;
    }
    throw error;
  }
  try {
    history = await getGameHistory({ limit: 5 });
  } catch (error) {
    if (error instanceof UserApiError && error.status === 401) redirect(loginPathFor("/dashboard"));
  }
  return (
    <DashboardShell user={user}>
      <DashboardHeader user={user} />
      <div className="mt-6 lg:mt-8">
        <QuickStats stats={user.stats} />
      </div>
      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.8fr)]">
        <RecentGames history={history} />
        <FriendsOnline />
      </div>
      <AvailableRooms />
    </DashboardShell>
  );
}
