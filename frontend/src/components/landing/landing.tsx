"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useScroll, useSpring } from "motion/react";
import {
  BookOpen,
  BrainCircuit,
  Check,
  Clipboard,
  Gamepad2,
  Link2,
  Menu,
  MessagesCircle,
  MonitorPlay,
  Play,
  Settings2,
  Sparkles,
  Trophy,
  UserGroup,
  Vote,
  X,
  Zap,
} from "lucide-react";
import { Button } from "../ui/button";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import type { UserData } from "@/types/userData";

const nav = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Categories", href: "#categories" },
  { label: "Gameplay", href: "#gameplay" },
  { label: "Features", href: "#features" },
  { label: "Lobby", href: "#lobby" },
];
const steps = [
  {
    number: "01",
    title: "The category",
    icon: BookOpen,
    text: "Choose the category that will shape the next question and set the room’s strategy in motion.",
    footer: "Choose the next challenge",
    color: "text-[#ffb59d]",
  },
  {
    number: "02",
    title: "The trap",
    icon: Sparkles,
    text: "Don’t know it? Craft a convincing trap answer designed to mimic the truth and lure unsuspecting friends.",
    footer: "Weaponize confidence",
    color: "text-[#c0c1ff]",
  },
  {
    number: "03",
    title: "The vote",
    icon: Vote,
    text: "Scan all shuffled submissions anonymously. Can you pick out the actual fact from a friend-made lie?",
    footer: "Mind the landmines",
    color: "text-accent",
  },
  {
    number: "04",
    title: "The reveal",
    icon: Trophy,
    text: "Reveal the trap masterminds, score for every player you fooled, and climb the final standings.",
    footer: "See who fooled whom",
    color: "text-primary",
  },
];
const features = [
  {
    title: "Cross-Device Multiplayer",
    description:
      "Use your smartphone as your private secret gamepad while projecting the big scoreboard onto a living room TV or Discord screen share.",
    icon: Gamepad2,
    color: "orange",
  },
  {
    title: "High-Stakes Bluffing Engine",
    description:
      "You earn points for knowing the truth, but the biggest score windfalls happen when you convince three friends that your hilarious lie is genuine history.",
    icon: BrainCircuit,
    color: "purple",
  },
  {
    title: "Real-time Banter & Taunts",
    description:
      "Instant sound effects, synchronized on-screen reactions, and custom party taunts that blast out the moment an opponent falls into your trap.",
    icon: MessagesCircle,
    color: "yellow",
  },
  {
    title: "Custom Room Rules",
    description:
      "Control bluff timer limits, modify round lengths, toggle family-friendly packs, or choose specialized themes like 90s Pop,Cinema, or Weird Science.",
    icon: Settings2,
    color: "gray",
  },
];

const easeOut = [0.22, 1, 0.36, 1] as const;

function AmbientHero({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
    >
      <motion.div
        className="absolute -left-24 top-16 size-72 rounded-full bg-primary/10 blur-[90px]"
        animate={
          reducedMotion
            ? undefined
            : { x: [0, 70, 0], y: [0, 35, 0], scale: [1, 1.18, 1] }
        }
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute right-[8%] top-[10%] size-[28rem] rounded-full bg-[#5b5fef]/10 blur-[110px]"
        animate={
          reducedMotion
            ? undefined
            : { x: [0, -55, 0], y: [0, 50, 0], scale: [1.1, 0.92, 1.1] }
        }
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="landing-grid absolute inset-0 opacity-25" />
    </div>
  );
}

function RevealHeading({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ duration: 0.7, ease: easeOut }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function Brand() {
  return (
    <a
      href="#top"
      className="inline-flex items-center gap-2.5 font-black tracking-wide text-primary"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
        <Zap className="size-5 fill-current" aria-hidden="true" />
      </div>
      <span>TRIVIA TRAP</span>
    </a>
  );
}

function PhaseCard({
  phase,
  title,
  description,
  children,
  color,
  index,
}: {
  phase: string;
  title: string;
  description: string;
  children: React.ReactNode;
  color: string;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28, scale: 0.98 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.2 }}
      whileHover={{ y: -7, borderColor: "#5b5fef" }}
      transition={{ duration: 0.58, delay: index * 0.1, ease: easeOut }}
      className="flex min-h-[325px] flex-col rounded-xl border border-[#353438] bg-[#1c1c20] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.12)]"
    >
      <div className="mb-3 flex items-center justify-between text-[10px] font-black uppercase tracking-wider">
        <span className={`rounded px-2 py-1 ${color}`}>PHASE {phase}</span>
        <span className="text-[#b6aba9]">00 : 24</span>
      </div>
      <h3 className="text-lg font-display">{title}</h3>
      <p className="mb-5 mt-1 min-h-12 text-xs leading-relaxed text-[#aaa3a7]">
        {description}
      </p>
      <div className="flex-1 rounded-lg border border-[#303035] bg-background p-3">
        {children}
      </div>
    </motion.div>
  );
}

type LandingUser = Pick<UserData, "username" | "avatar">;

export default function LandingPage({ user }: { user: LandingUser | null }) {
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, {
    stiffness: 110,
    damping: 28,
    restDelta: 0.001,
  });
  const [mobileMenu, setMobileMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <main id="top" className="overflow-hidden bg-[#0e0e11] text-foreground">
      <motion.div
        className="fixed inset-x-0 top-0 z-50 h-[2px] origin-left bg-gradient-to-r from-primary via-accent to-[#5b5fef]"
        style={{ scaleX: progress }}
      />
      <motion.header
        initial={{ y: reducedMotion ? 0 : -70 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.7, ease: easeOut }}
        className="relative z-20 border-b border-[#29292d] bg-[#101013]/90 backdrop-blur-xl"
      >
        <div className="mx-auto flex h-[66px] max-w-[1400px] items-center justify-between gap-5 px-5 lg:px-9">
          <Brand />
          <nav
            aria-label="Main navigation"
            className="hidden items-center gap-5 xl:gap-7 lg:flex"
          >
            {nav.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className="text-[10px] font-extrabold uppercase tracking-wider text-[#c0aeb0] hover:text-white"
              >
                {n.label}
              </a>
            ))}
          </nav>
          <div className="hidden gap-2 sm:flex">
            <Button asChild className="min-h-9 px-4 " variant="outline">
              <Link href={user ? "/dashboard" : "/join"}>
                {user ? "Dashboard" : "Join room"}
              </Link>
            </Button>
            <Button asChild className="min-h-9 px-4 " variant="flame">
              <Link href="/create-room">
                <Gamepad2 size={13} /> Create room
              </Link>
            </Button>
          </div>
          <Button
            className="rounded-lg p-2 lg:hidden"
            onClick={() => setMobileMenu(!mobileMenu)}
            aria-label="Toggle menu"
            aria-expanded={mobileMenu}
          >
            {mobileMenu ? <X /> : <Menu />}
          </Button>
        </div>
        {mobileMenu && (
          <nav className="flex flex-col gap-3 border-t border-[#303035] px-5 py-5 lg:hidden">
            {nav.map((n) => (
              <a
                key={n.href}
                href={n.href}
                onClick={() => setMobileMenu(false)}
                className="text-sm font-display uppercase text-[#d9cbcb]"
              >
                {n.label}
              </a>
            ))}
            <Button
              asChild
              variant="outline"
              className="text-left text-sm font-display uppercase "
            >
              <Link
                href={user ? "/dashboard" : "/join"}
                onClick={() => setMobileMenu(false)}
              >
                {user ? "Dashboard" : "Join room"}
              </Link>
            </Button>
            <Button
              asChild
              variant="flame"
              className="text-left text-sm font-display uppercase "
            >
              <Link href="/create-room" onClick={() => setMobileMenu(false)}>
                Create room
              </Link>
            </Button>
          </nav>
        )}
      </motion.header>
      <section className="relative border-b border-[#29292e] bg-[radial-gradient(circle_at_62%_22%,#33232b_0%,transparent_38%),radial-gradient(circle_at_85%_70%,#242143_0%,transparent_38%)]">
        <AmbientHero reducedMotion={reducedMotion} />
        <div className="relative mx-auto grid min-h-[670px] max-w-[1400px] items-center gap-14 px-5 py-20 lg:grid-cols-[.95fr_1fr] lg:px-9 lg:py-24">
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reducedMotion ? 0.01 : 0.9, ease: easeOut }}
          >
            <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#4d3530] bg-[#2b2020] px-3 py-2 text-[10px] font-black uppercase tracking-wider text-[#ead0c9]">
              <span className="size-1.5 rounded-full bg-primary" /> The
              multiplayer trivia & deception game
            </p>
            <h1 className="max-w-xl text-[clamp(3.4rem,6vw,6.8rem)] font-black uppercase leading-[.91] tracking-[-.055em]">
              Know the
              <br />
              answer.
              <br />
              <span className="text-primary underline decoration-primary decoration-[5px] underline-offset-[8px]">
                Bluff the
                <br />
                room.
              </span>
            </h1>
            <p className="mt-7 max-w-xl text-base leading-relaxed text-[#cabbbc]">
              Answer authentic trivia, submit convincing trap answers, and
              expose the decoys before your friends fool the whole room.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/create-room">
                  <Gamepad2 size={16} /> Create room
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/join">
                  Enter room code{" "}
                  <span className="rounded bg-[#4a4a50] px-2 py-1 text-[10px]">
                    JOIN
                  </span>
                </Link>
              </Button>
            </div>
            <p className="mt-7 flex items-center gap-2 text-xs text-[#c1b5bb]">
              <span className="grid size-6 place-items-center rounded-full bg-[#30318a] text-[#c9caff]">
                <Zap size={13} />
              </span>
              <strong>Invite your whole crew</strong> · Play together in the
              browser
            </p>
          </motion.div>
          <motion.div
            initial={{
              opacity: 0,
              scale: reducedMotion ? 1 : 0.92,
              y: reducedMotion ? 0 : 24,
            }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{
              duration: reducedMotion ? 0.01 : 1.1,
              delay: reducedMotion ? 0 : 0.16,
              ease: easeOut,
            }}
            className="relative min-h-[390px] lg:min-h-[560px]"
          >
            <div className="absolute inset-[8%] rounded-full bg-[radial-gradient(circle_at_45%_42%,rgba(255,107,53,0.25),transparent_42%),radial-gradient(circle_at_72%_58%,rgba(91,95,239,0.28),transparent_48%)] blur-2xl" />
            <motion.div
              aria-hidden="true"
              animate={
                reducedMotion
                  ? undefined
                  : { rotate: [0, 4, 0], scale: [1, 1.035, 1] }
              }
              transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
              className="absolute inset-[12%] rounded-[32%] border border-primary/20 bg-[conic-gradient(from_145deg,rgba(255,107,53,0.13),rgba(91,95,239,0.08),transparent_45%,rgba(247,201,72,0.08),rgba(255,107,53,0.13))] shadow-[0_0_90px_rgba(91,95,239,0.14)]"
            />
            <div className="absolute left-[7%] top-[16%] size-2 rounded-full bg-accent shadow-[0_0_18px_5px_rgba(247,201,72,0.3)]" />
            <div className="absolute bottom-[18%] right-[5%] size-3 rounded-full bg-primary shadow-[0_0_22px_6px_rgba(255,107,53,0.28)]" />
            <motion.div
              animate={
                reducedMotion
                  ? undefined
                  : { y: [0, -10, 0], rotate: [-0.5, 0.5, -0.5] }
              }
              transition={{
                duration: 5.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="absolute inset-0 z-10"
            >
              <Image
                src="/images/hero.webp"
                alt="Trivia Trap multiplayer game preview"
                fill
                priority
                sizes="(min-width: 1024px) 50vw, 92vw"
                className="object-contain drop-shadow-[0_35px_45px_rgba(0,0,0,0.5)]"
              />
            </motion.div>
          </motion.div>
        </div>
      </section>
      <section
        id="how-it-works"
        className="border-b border-[#29292e] bg-[#141417] py-24"
      >
        <div className="mx-auto max-w-[1400px] px-5 lg:px-9">
          <RevealHeading className="mb-12 text-center">
            <p className="text-xs font-black uppercase tracking-widest text-primary">
              Four easy steps
            </p>
            <h2 className="mt-2 text-4xl font-black uppercase tracking-tight md:text-5xl">
              How the trap works
            </h2>
            <p className="mt-4 text-sm text-[#aa9ea2]">
              Simple enough for grandma, ruthless enough to destroy your group
              chat friendships.
            </p>
          </RevealHeading>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {steps.map((s, index) => (
              <motion.article
                initial={{ opacity: 0, y: reducedMotion ? 0 : 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                whileHover={reducedMotion ? undefined : { y: -4 }}
                transition={{
                  duration: reducedMotion ? 0.01 : 0.58,
                  delay: reducedMotion ? 0 : index * 0.08,
                  ease: easeOut,
                }}
                key={s.number}
                className="flex min-h-[245px] flex-col rounded-xl border border-[#353438] bg-[#1c1c20] p-6"
              >
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-black text-[#a26959]">
                    {s.number}
                  </span>
                  <s.icon size={20} className={s.color} />
                </div>
                <h3 className="mt-6 text-lg font-black uppercase">{s.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-[#b8afb1]">
                  {s.text}
                </p>
                <p
                  className={`mt-6 border-t border-[#313136] pt-4 text-xs font-display ${s.color}`}
                >
                  ◈ {s.footer}
                </p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>
      <section id="gameplay" className="border-b border-[#29292e] py-24">
        <div className="mx-auto max-w-[1400px] px-5 lg:px-9">
          <RevealHeading className="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-[#a8a4ff]">
                Dynamic match phases
              </p>
              <h2 className="mt-2 text-4xl font-black uppercase tracking-tight md:text-5xl">
                Every round is a trap
              </h2>
            </div>
            <p className="max-w-md text-sm leading-relaxed text-[#a69b9f]">
              Follow the real match flow from writing a trap through voting,
              reveal, and the round standings.
            </p>
          </RevealHeading>
          <div className="grid gap-4 lg:grid-cols-3">
            <PhaseCard
              index={0}
              phase="1: trap"
              title="Planting The Trap"
              description="Write one convincing trap answer before the round timer expires."
              color="bg-[#292763] text-[#bbbaff]"
            >
              <p className="mb-2 text-[10px] font-display uppercase text-[#c5a4a3]">
                ▣ Submit your fake answer
              </p>
              <div className="rounded-md bg-[#2b2b30] p-3 font-mono text-sm">
                The Venetian Sky Mirror{" "}
                <span className="float-right text-primary">▌</span>
              </div>
              <p className="mt-4 text-[10px] text-[#b4a9ac]">
                Characters: 24 / 60{" "}
                <span className="float-right text-[#50ca8c]">
                  ✓ Ready to submit
                </span>
              </p>
            </PhaseCard>
            <PhaseCard
              index={1}
              phase="2: voting"
              title="Voting"
              description="All decoys appear alongside the real answer. Trust your gut or fall into a trap."
              color="bg-[#534b23] text-[#f7d664]"
            >
              <div className="space-y-2 text-xs">
                {[
                  "King Tut’s Marble Bath",
                  "The Venetian Sky Mirror",
                  "Hanging Gardens of Babylon",
                ].map((a, i) => (
                  <div
                    key={a}
                    className={`rounded-md px-3 py-3 ${i === 1 ? "border border-[#7474df] bg-[#302d82] text-white" : "bg-[#2b2b30] text-[#d3cdd0]"}`}
                  >
                    {i + 1}. {a}
                    <span className="float-right"></span>
                  </div>
                ))}
              </div>
            </PhaseCard>
            <PhaseCard
              index={2}
              phase="3: answer reveal"
              title="Answer Reveal"
              description="Reveal the real answer, expose each trap author, and award the round points."
              color="bg-[#54301c] text-[#ff8c50]"
            >
              <div className="space-y-2 text-xs">
                {[
                  ["#1", "Alex (The Architect)", "+2 PTS"],
                  ["#2", "Mehdi (YOU)", "+1 PTS"],
                  ["#3", "Sarah Q", "+0 PTS"],
                ].map(([rank, n, points]) => (
                  <div
                    key={rank}
                    className="flex justify-between rounded-md bg-[#29292e] p-3"
                  >
                    <span>
                      {rank} &nbsp;{n}
                    </span>
                    <b className="text-[#ffb59d]">{points}</b>
                  </div>
                ))}
              </div>
            </PhaseCard>
          </div>
        </div>
      </section>
      <section
        id="lobby"
        className="border-b border-[#29292e] bg-background py-24"
      >
        <div className="mx-auto grid max-w-[1400px] items-center gap-14 px-5 lg:grid-cols-2 lg:px-9">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-primary">
              Zero friction joining
            </p>
            <h2 className="mt-4 text-4xl font-black uppercase leading-[.95] tracking-tight md:text-6xl">
              Play with any
              <br />
              crew.
              <br />
              <span className="text-[#c0c1ff]">Anywhere.</span>
            </h2>
            <p className="mt-8 max-w-lg text-base leading-relaxed text-[#c3b5ba]">
              Create a room, share the room code or QR link, and let everyone
              join the same lobby from their browser.
            </p>
            <div className="mt-8 space-y-5">
              <div className="flex gap-4">
                <MonitorPlay className="shrink-0 text-primary" size={22} />
                <p className="text-sm text-[#a99fa4]">
                  <b className="block text-white">Universal Cross-Play</b>Works
                  natively on iOS, Android, macOS, Windows, and Steam Deck
                  browsers.
                </p>
              </div>
              <div className="flex gap-4">
                <UserGroup className="shrink-0 text-accent" size={22} />
                <p className="text-sm text-[#a99fa4]">
                  <b className="block text-white">
                    Up to 10 Friends in Live Sync
                  </b>
                  Instant zero-lag WebSocket connection ensures synchronised
                  countdowns.
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-[#353438] bg-[#1d1d21] p-4 sm:p-7">
            <div className="rounded-lg bg-[#101013] p-6 text-center">
              <p className="text-[10px] font-display uppercase text-[#b8aab0]">
                Your exclusive room pin
              </p>
              <div className="flex items-center justify-center gap-3">
                <strong className="text-4xl font-black tracking-[.12em] text-accent sm:text-6xl">
                  X7K9P2
                </strong>
                <button
                  aria-label="Copy room code"
                  onClick={async () => {
                    await navigator.clipboard.writeText("X7K9P2");
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="rounded-lg bg-[#29292e] p-2 text-[#ddd] hover:bg-[#444]"
                >
                  {copied ? <Check size={18} /> : <Clipboard size={18} />}
                </button>
              </div>
              <p className="mt-3 text-[10px] text-[#998f94]">
                {copied
                  ? "Copied!"
                  : "Share this link: your-game.example/X7K9P2"}
              </p>
            </div>
            <div className="mt-5 flex justify-between text-[10px] font-display uppercase text-[#c7b7b7]">
              <span>Room roster (6 / 8 connected)</span>
              <span className="text-[#4ade80]">● Lobby ready</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
              {[
                "Alex (Host)",
                "Mehdi (YOU)",
                "Sarah Q.",
                "Yassine",
                "Adam K.",
                "Sam B.",
              ].map((p, i) => (
                <div
                  key={p}
                  className="flex items-center gap-2 rounded-lg border border-[#333338] bg-[#151518] p-2"
                >
                  <span
                    className={`grid size-6 shrink-0 place-items-center rounded-full font-black ${i === 0 ? "bg-accent text-black" : i === 1 ? "bg-primary text-black" : "bg-[#34343d] text-white"}`}
                  >
                    {p[0]}
                  </span>
                  <span className="truncate font-semibold">
                    {p}
                    <small className="block text-[9px] text-[#52cc8b]">
                      READY
                    </small>
                  </span>
                </div>
              ))}
            </div>
            <Button asChild className="mt-5 w-full">
              <Link href="/create-room">
                <Play size={14} fill="currentColor" /> Open game lobby
              </Link>
            </Button>
          </div>
        </div>
      </section>
      <section id="features" className="py-24">
        <div className="mx-auto max-w-[1400px] px-5 lg:px-9">
          <div className="text-center">
            <p className="text-xs font-black uppercase tracking-widest text-primary">
              Built for party chaos
            </p>
            <h2 className="mt-2 text-4xl font-black uppercase leading-none tracking-tight md:text-5xl">
              Engineered for
              <br />
              laughs
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-[#a99da2]">
              Pure social deduction without the fluff. Everything designed to
              keep games quick, intense, and replayable.
            </p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {features.map((f) => (
              <motion.article
                initial={{ opacity: 0, y: reducedMotion ? 0 : 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                whileHover={reducedMotion ? undefined : { y: -4 }}
                transition={{ duration: reducedMotion ? 0.01 : 0.42 }}
                key={f.title}
                className="flex gap-5 rounded-xl border border-[#353438] bg-[#1c1c20] p-6"
              >
                <span
                  className={`grid size-12 shrink-0 place-items-center rounded-lg ${f.color === "orange" ? "bg-[#5c3021] text-primary" : f.color === "purple" ? "bg-[#2e2b73] text-[#c0c1ff]" : f.color === "yellow" ? "bg-[#5c4b20] text-accent" : "bg-[#333338] text-[#c4c1c5]"}`}
                >
                  <f.icon size={22} />
                </span>
                <div>
                  <h3 className="font-display">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#b1a6aa]">
                    {f.description}
                  </p>
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </section>
      <section
        id="categories"
        className="mx-auto max-w-[1400px] px-5 pb-24 lg:px-9"
      >
        <div className="rounded-2xl border border-[#854020] bg-[radial-gradient(circle_at_50%_0%,#593225_0%,transparent_40%),linear-gradient(145deg,#202025,#17171b)] px-5 py-16 text-center sm:px-10">
          <p className="mx-auto w-fit rounded-full bg-[#603b2e] px-4 py-2 text-[10px] font-black uppercase tracking-wider text-[#ffb59d]">
            ◉ Instant multiplayer session
          </p>
          <h2 className="mt-5 text-4xl font-black uppercase leading-none tracking-tight md:text-6xl">
            Ready to fool your
            <br />
            friends?
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-[#c7b8ba]">
            Create a room, share the code, and start a fast round of trivia
            deception with your group.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3 ">
            <Button asChild>
              <Link href="/create-room">
                <Zap size={15} /> Create a room now
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/join">
                <Link2 size={15} /> Enter room code
              </Link>
            </Button>
          </div>
          <p className="mt-6 text-[11px] text-[#ac999e]">
            Create · Invite · Trap · Vote · Reveal
          </p>
        </div>
      </section>
      <footer className="border-t border-[#353438] bg-background">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-6 px-5 py-10 lg:px-9">
          <Brand />
          <div className="flex flex-wrap gap-5 text-[10px] font-display uppercase tracking-wide text-[#b6a8ad]">
            <a href="#how-it-works">How it works</a>
            <a href="#gameplay">Gameplay</a>
            <a href="#features">Features</a>
            <a href="#lobby">Lobby</a>
            <Link href="/privacy">Privacy Policy</Link>
          </div>
          <p className="text-xs text-[#8f878b]">
            © {new Date().getFullYear()} Trivia Trap. All rights reserved.
          </p>
        </div>
      </footer>
    </main>
  );
}
