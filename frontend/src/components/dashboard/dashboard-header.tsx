import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UserData } from "@/types/userData";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { createRoomAction } from "@/app/create-room/actions";

export function DashboardHeader({ user }: { user: UserData }) {
  return (
    <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Welcome back, {user.username}</p>
        <h1 className="mt-2 font-secondary text-2xl uppercase tracking-[-0.025em] text-white sm:text-3xl lg:text-[2.15rem]">
          Ready to fool your friends?
        </h1>
        <p className="mt-2 text-sm text-[#a6a6ae]">Your next great bluff is only one room away.</p>
      </div>
      <div className="flex w-full items-center gap-3 sm:w-auto">
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-2.5 sm:flex">
          <Button asChild variant="outline" className="h-11 px-4 text-xs">
            <Link href="/join">Join room <ArrowRight className="size-4" /></Link>
          </Button>
          <form action={createRoomAction} className="min-w-0">
            <Button type="submit" className="h-11 w-full px-4 text-xs">
              <Plus className="size-4" /> Create room
            </Button>
          </form>
        </div>
        <Link href="/profile" aria-label={`Open ${user.username}'s profile`} className="relative rounded-full transition-transform hover:scale-105">
          <ProfileAvatar
            name={user.username}
            imageUrl={user.avatar}
            size={40}
          />
          <span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-trap-success ring-2 ring-background" aria-label="Online" />
        </Link>
      </div>
    </header>
  );
}
