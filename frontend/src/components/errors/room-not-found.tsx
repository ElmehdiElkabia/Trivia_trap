"use client";

import Link from "next/link";
import {
  ArrowLeft,
  DoorOpen,
  Lightbulb,
  Radio,
  Sparkles,
  Zap,
} from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

export function RoomNotFound() {
  const reducedMotion = useReducedMotion();
  const enter = (delay: number) => ({
    initial: { opacity: 0, y: reducedMotion ? 0 : 16 },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: reducedMotion ? 0.01 : 0.5,
      delay: reducedMotion ? 0 : delay,
    },
  });

  return (
    <main className="relative isolate flex min-h-svh flex-col overflow-hidden bg-[#0e0e11] text-foreground">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-20 opacity-50 [background-image:radial-gradient(rgba(255,255,255,0.055)_0.7px,transparent_0.7px)] [background-size:5px_5px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64 overflow-hidden"
      >
        <div className="absolute -left-24 -top-40 h-72 w-[65vw] -rotate-6 rounded-[45%] bg-primary/20 blur-[65px]" />
        <div className="absolute -right-32 -top-44 h-80 w-[58vw] rotate-12 rounded-[45%] bg-secondary/25 blur-[75px]" />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-72 overflow-hidden"
      >
        <div className="absolute -bottom-48 -left-32 h-80 w-[62vw] rotate-6 rounded-[45%] bg-secondary/25 blur-[75px]" />
        <div className="absolute -bottom-52 -right-28 h-80 w-[64vw] -rotate-12 rounded-[45%] bg-primary/20 blur-[70px]" />
      </div>

      <header className="border-b border-white/[0.07] bg-[#101013]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-[68px] w-full max-w-[1400px] items-center justify-between gap-4 px-5 sm:px-8 lg:px-10">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 font-black tracking-wide text-primary"
          >
            <span className="grid size-9 place-items-center rounded-xl border border-primary/30 bg-primary/10">
              <Zap className="size-5 fill-current" aria-hidden="true" />
            </span>
            <span>TRIVIA TRAP</span>
          </Link>
          <span className="inline-flex items-center gap-2 rounded-full border border-trap-success/20 bg-trap-success/5 px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-[0.14em] text-trap-success sm:text-[10px]">
            <span className="size-1.5 rounded-full bg-current shadow-[0_0_8px_currentColor]" />
            <span className="hidden xs:inline">Systems operational</span>
            <span className="xs:hidden">Online</span>
          </span>
        </div>
      </header>

      <section
        aria-labelledby="room-not-found-title"
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-5 py-12 text-center sm:px-8 sm:py-16"
      >
        <motion.div
          {...enter(0.06)}
          className="flex flex-wrap items-center justify-center gap-2 text-[9px] font-extrabold uppercase tracking-[0.16em] sm:text-[10px]"
        >
          <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-trap-primary-soft">
            Error code 404
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-[#8f8f99]">
            Lobby lookup failed
          </span>
        </motion.div>

        <motion.p
          {...enter(0.1)}
          className="mt-5 font-blackops text-[clamp(4rem,12vw,7.5rem)] leading-[0.8] tracking-[-0.05em] text-primary drop-shadow-[0_0_30px_rgba(255,107,53,0.2)]"
        >
          404
        </motion.p>
        <motion.h1
          {...enter(0.14)}
          id="room-not-found-title"
          className="mt-5 font-secondary text-[clamp(2rem,6vw,4.2rem)] uppercase leading-none tracking-[-0.03em] text-white"
        >
          Room not found
        </motion.h1>
        <motion.p
          {...enter(0.18)}
          className="mt-5 max-w-xl text-sm leading-6 text-[#a6a6ae] sm:text-base sm:leading-7"
        >
          That room code is invalid, the room has expired, or the match has
          already ended. Check the code and try joining again.
        </motion.p>

        <motion.div
          {...enter(0.22)}
          className="mt-8 flex w-full max-w-md flex-col justify-center gap-3 sm:flex-row"
        >
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/">
              <ArrowLeft className="size-4" aria-hidden="true" /> Back to home
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="secondary"
            className="w-full sm:w-auto"
          >
            <Link href="/join">
              <DoorOpen className="size-4" aria-hidden="true" /> Join a room
            </Link>
          </Button>
        </motion.div>
      </section>

      <footer className="border-t border-white/[0.07] bg-[#101013]/70">
        <div className="mx-auto flex w-full max-w-[1400px] flex-col items-center justify-between gap-4 px-5 py-6 text-[11px] text-[#777782] sm:flex-row sm:px-8 lg:px-10">
          <p>© {new Date().getFullYear()} Trivia Trap. All rights reserved.</p>
          <nav
            aria-label="Footer navigation"
            className="flex flex-wrap justify-center gap-x-5 gap-y-2 font-bold uppercase tracking-[0.08em]"
          >
            <Link href="/" className="transition-colors hover:text-white">
              Home
            </Link>
            <Link href="/join" className="transition-colors hover:text-white">
              Join room
            </Link>
            <Link
              href="/privacy"
              className="transition-colors hover:text-white"
            >
              Privacy
            </Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
