import type { LucideIcon } from "lucide-react";
import { AlertTriangle, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  icon?: LucideIcon;
  className?: string;
}

export function ErrorState({ title, description, actionLabel, onAction, secondaryActionLabel, onSecondaryAction, icon: Icon = AlertTriangle, className }: ErrorStateProps) {
  return (
    <div role="alert" className={cn("rounded-2xl border border-destructive/30 bg-destructive/[0.07] p-5 text-center", className)}>
      <span className="mx-auto grid size-10 place-items-center rounded-xl bg-destructive/15 text-destructive">
        { title == "CONRATULATIONS, THIS IS THE EXACT TRUTH" ? <PartyPopper className="size-5 text-[#ff6000]" aria-hidden="true" /> : <Icon className="size-5" aria-hidden="true" /> }
      </span>
      <h2 className="mt-3 font-display text-lg font-black text-foreground">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">{description}</p>
      {actionLabel || secondaryActionLabel ? (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {actionLabel ? <Button type="button" onClick={onAction}>{actionLabel}</Button> : null}
          {secondaryActionLabel ? <Button type="button" variant="outline" onClick={onSecondaryAction}>{secondaryActionLabel}</Button> : null}
        </div>
      ) : null}
    </div>
  );
}
