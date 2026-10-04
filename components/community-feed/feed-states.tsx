import { AlertCircle, Megaphone, MessageCircle, Plus, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { BTN_PRIMARY, BTN_SECONDARY } from "./feed-header";

export function FeedEmpty({
  icon = "message",
  title,
  text,
  primary,
  secondary,
}: {
  icon?: "message" | "megaphone";
  title: string;
  text: string;
  primary?: { label: string; onClick: () => void };
  secondary?: { label: string; onClick: () => void };
}) {
  const Icon = icon === "megaphone" ? Megaphone : MessageCircle;
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-9 text-center">
      <div className="mb-1 grid h-16 w-16 place-items-center rounded-[18px] bg-brand-soft text-brand-ink">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <h3 className="text-balance font-display text-[19px] font-semibold text-ink">{title}</h3>
      <p className="max-w-[44ch] text-[15px] text-ink-2">{text}</p>
      {(primary || secondary) && (
        <div className="mt-1.5 flex flex-wrap justify-center gap-2">
          {primary && (
            <button type="button" className={BTN_PRIMARY} onClick={primary.onClick}>
              <Plus aria-hidden="true" />
              {primary.label}
            </button>
          )}
          {secondary && (
            <button type="button" className={BTN_SECONDARY} onClick={secondary.onClick}>
              {secondary.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function FeedError({ title, text, onRetry, className }: { title: string; text: string; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn("flex items-start gap-3 rounded-xl border border-live/30 bg-live-soft px-4 py-3.5 text-ink", className)}>
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-live" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <strong className="block text-[15px]">{title}</strong>
        <p className="text-[14px] text-ink-2">{text}</p>
      </div>
      {onRetry && (
        <button type="button" className={BTN_SECONDARY} onClick={onRetry}>
          <RefreshCw aria-hidden="true" />
          Try again
        </button>
      )}
    </div>
  );
}
