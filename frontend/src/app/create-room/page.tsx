import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createRoomAction } from "./actions";

export default function CreateRoomPage() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-3xl items-center justify-center px-4 py-12">
      <section className="w-full rounded-3xl border border-white/[0.08] bg-trap-surface p-6 shadow-[0_24px_80px_rgba(0,0,0,0.25)] sm:p-10">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">
          Ready to play?
        </p>
        <h1 className="mt-3 font-secondary text-3xl uppercase tracking-tight text-white sm:text-4xl">
          Create your room
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-[#a6a6ae]">
          Start a new lobby, invite your friends with the room code, and see who can bluff their way to victory.
          A room will only be created when you press the button below.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <form action={createRoomAction}>
            <Button type="submit" className="h-11 w-full px-5 sm:w-auto">
              <Plus className="size-4" />
              Create room and continue
            </Button>
          </form>
          <Button asChild variant="outline" className="h-11">
            <Link href="/dashboard">
              <ArrowLeft className="size-4" />
              Back to dashboard
            </Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
