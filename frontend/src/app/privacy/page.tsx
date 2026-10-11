import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Cookie, Database, Mail, ShieldCheck, Users, Zap } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy | Trivia Trap",
  description: "A clear look at how Trivia Trap uses your account and game information.",
};

const contactEmail = "triviatrap0@gmail.com";
const topics = [
  { id: "collect", label: "What we collect" },
  { id: "use", label: "How we use it" },
  { id: "share", label: "What players see" },
  { id: "storage", label: "Cookies & storage" },
  { id: "contact", label: "Your choices" },
];

export default function PrivacyPage() {
  return (
    <main id="top" className="relative isolate min-h-screen overflow-x-hidden bg-trap-canvas text-foreground">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[540px] bg-[radial-gradient(ellipse_at_20%_0%,rgba(255,107,53,.17),transparent_42%),radial-gradient(ellipse_at_85%_12%,rgba(91,95,239,.14),transparent_42%)]" />
      <div aria-hidden="true" className="landing-grid pointer-events-none absolute inset-x-0 top-0 -z-10 h-[540px] opacity-20 [mask-image:linear-gradient(to_bottom,black,transparent)]" />

      <header className="border-b border-white/10 bg-[#111114]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/" className="inline-flex items-center gap-2.5 text-sm font-black tracking-wide text-primary sm:text-base" aria-label="Trivia Trap home">
            <span className="grid size-9 place-items-center rounded-xl border border-primary/30 bg-primary/10 text-primary"><Zap size={20} fill="currentColor" aria-hidden="true" /></span>
            <span>TRIVIA TRAP</span>
          </Link>
          <Link href="/" className="inline-flex items-center gap-2 text-xs font-bold text-trap-text-dim transition-colors hover:text-white"><ArrowLeft className="size-4" aria-hidden="true" /> Back to site</Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 pb-20 pt-14 sm:px-8 sm:pt-20">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.16em] text-trap-primary-soft"><ShieldCheck className="size-3.5" aria-hidden="true" /> Your data, explained</span>
          <h1 className="mt-6 font-secondary text-4xl uppercase leading-[1.04] tracking-tight text-white sm:text-6xl">Privacy <span className="text-primary">Policy</span></h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-[#c9c5cc]">Here&apos;s the simple version of what Trivia Trap uses to create your account and let you play with friends.</p>
          <p className="mt-4 text-xs text-trap-text-dim">Last updated October 11, 2026</p>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-12">
          <nav aria-label="Privacy policy sections" className="h-fit rounded-2xl border border-white/10 bg-trap-panel p-5 lg:sticky lg:top-8">
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-trap-text-dim">On this page</p>
            <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">
              {topics.map((topic) => <li key={topic.id}><a href={`#${topic.id}`} className="block rounded-lg px-2 py-2 text-xs font-semibold text-[#b7b4be] transition-colors hover:bg-white/[0.05] hover:text-white">{topic.label}</a></li>)}
            </ul>
          </nav>

          <div className="space-y-5">
            <section id="collect" className="scroll-mt-8 rounded-2xl border border-white/10 bg-trap-panel p-6 sm:p-8">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">01 / The basics</p>
              <h2 className="mt-2 font-secondary text-2xl uppercase text-white sm:text-3xl">What we collect</h2>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-white/[0.025] p-5"><Database className="mb-4 size-5 text-primary" aria-hidden="true" /><h3 className="font-bold text-white">Your account</h3><p className="mt-2 text-sm leading-6 text-trap-text-dim">Email, player name and any avatar you upload. Email sign-in stores a password hash. Google sign-in stores your Google account ID and verified email.</p></div>
                <div className="rounded-xl border border-white/10 bg-white/[0.025] p-5"><Users className="mb-4 size-5 text-trap-secondary-soft" aria-hidden="true" /><h3 className="font-bold text-white">Your activity</h3><p className="mt-2 text-sm leading-6 text-trap-text-dim">Friendships, invitations, achievements and saved game results. During a game we process room activity, answers, bluffs, votes, scores and chat.</p></div>
              </div>
            </section>

            <section id="use" className="scroll-mt-8 rounded-2xl border border-white/10 bg-trap-panel p-6 sm:p-8">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">02 / In the game</p>
              <h2 className="mt-2 font-secondary text-2xl uppercase text-white sm:text-3xl">How we use it</h2>
              <p className="mt-5 text-sm leading-7 text-[#c9c5cc]">We use this information to sign you in, run rooms, calculate scores, show profiles and achievements, connect friends, and send password reset emails. We use basic server logs and backups to keep the service working.</p>
            </section>

            <section id="share" className="scroll-mt-8 rounded-2xl border border-white/10 bg-trap-panel p-6 sm:p-8">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">03 / With friends</p>
              <h2 className="mt-2 font-secondary text-2xl uppercase text-white sm:text-3xl">What other players see</h2>
              <p className="mt-5 text-sm leading-7 text-[#c9c5cc]">Other signed-in players can see your player name, avatar and in-app profile. Players in your room see your chat and game activity as the round unfolds. Friends can see your online status. Your email, password hash and Google account ID are not shown on your player profile.</p>
            </section>

            <section id="storage" className="scroll-mt-8 rounded-2xl border border-white/10 bg-trap-panel p-6 sm:p-8">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">04 / On your device</p>
              <h2 className="mt-2 font-secondary text-2xl uppercase text-white sm:text-3xl">Cookies & storage</h2>
              <div className="mt-5 flex gap-4"><Cookie className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" /><div className="space-y-3 text-sm leading-7 text-[#c9c5cc]"><p>An <code className="text-white">access_token</code> cookie keeps you signed in. It currently lasts up to 30 minutes and page scripts cannot read it. Temporary browser storage helps finish Google sign-up and remembers a guest player identity for a tab.</p><p>Google provides the optional sign-in button, and Gmail SMTP delivers password emails. Those services may handle related data under their own privacy notices.</p></div></div>
            </section>

            <section id="contact" className="scroll-mt-8 overflow-hidden rounded-2xl border border-primary/30 bg-[radial-gradient(circle_at_100%_0%,rgba(255,107,53,.14),transparent_45%),#1b1b1e] p-6 sm:p-8">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-trap-primary-soft">05 / Your choices</p>
              <h2 className="mt-2 font-secondary text-2xl uppercase text-white sm:text-3xl">Questions about your data?</h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[#c9c5cc]">You can ask us about the information tied to your account, or request a correction or deletion. We may ask you to confirm the account is yours. Account deletion is not currently available inside the app. Live room chat is kept in the running game process; account and saved game data stay in the database until removed. Backups follow the server&apos;s configured retention period.</p>
              <a href={`mailto:${contactEmail}?subject=Trivia%20Trap%20privacy%20request`} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground transition hover:brightness-110"><Mail className="size-4" aria-hidden="true" /> {contactEmail} <ArrowUpRight className="size-4" aria-hidden="true" /></a>
            </section>
          </div>
        </div>
      </div>

      <footer className="border-t border-white/10 bg-[#111114]"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-7 text-xs text-trap-text-dim sm:px-8"><span>© {new Date().getFullYear()} Trivia Trap</span><div className="flex gap-5"><Link href="/" className="hover:text-white">Home</Link><Link href="/login" className="hover:text-white">Sign in</Link><a href="#top" className="hover:text-white">Back to top ↑</a></div></div></footer>
    </main>
  );
}
