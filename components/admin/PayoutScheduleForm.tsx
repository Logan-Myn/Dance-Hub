"use client";

import { useState } from "react";
import { Calendar, CalendarDays, Loader2, Zap } from "lucide-react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Kind = "asap" | "weekly" | "monthly";

interface PayoutScheduleFormProps {
  communitySlug: string;
  initialInterval: string; // "daily" | "weekly" | "monthly" | "manual"
  initialWeeklyAnchor: string | null;
  initialMonthlyAnchor: number | null;
}

const WEEKDAYS = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
];

const MONTH_DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

const OPTIONS: { kind: Kind; title: string; subtitle: string; icon: typeof Zap }[] = [
  {
    kind: "asap",
    title: "As soon as possible",
    subtitle: "Auto-paid out as soon as funds clear (uses your country's default delay).",
    icon: Zap,
  },
  {
    kind: "weekly",
    title: "Weekly",
    subtitle: "One payout per week on a fixed weekday.",
    icon: Calendar,
  },
  {
    kind: "monthly",
    title: "Monthly",
    subtitle: "One payout per month on a fixed day.",
    icon: CalendarDays,
  },
];

function intervalToKind(interval: string): Kind {
  if (interval === "weekly") return "weekly";
  if (interval === "monthly") return "monthly";
  // daily / manual / unknown all collapse to ASAP for our 3-option model.
  return "asap";
}

export function PayoutScheduleForm({
  communitySlug,
  initialInterval,
  initialWeeklyAnchor,
  initialMonthlyAnchor,
}: PayoutScheduleFormProps) {
  const [kind, setKind] = useState<Kind>(intervalToKind(initialInterval));
  const [weekday, setWeekday] = useState<string>(
    initialWeeklyAnchor && WEEKDAYS.some((d) => d.value === initialWeeklyAnchor)
      ? initialWeeklyAnchor
      : "monday"
  );
  const [dayOfMonth, setDayOfMonth] = useState<number>(
    initialMonthlyAnchor && initialMonthlyAnchor >= 1 && initialMonthlyAnchor <= 28
      ? initialMonthlyAnchor
      : 1
  );
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    setIsSaving(true);
    try {
      const choice =
        kind === "asap"
          ? { kind: "asap" as const }
          : kind === "weekly"
          ? { kind: "weekly" as const, weekday }
          : { kind: "monthly" as const, dayOfMonth };

      const response = await fetch(
        `/api/community/${communitySlug}/payouts/schedule`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ choice }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Failed to update payout schedule");
      }
      toast.success("Payout schedule updated");
    } catch (error) {
      console.error("Error updating payout schedule:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to update schedule"
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="bg-card rounded-2xl p-6 border border-border/50 space-y-5">
      <div>
        <h2 className="font-display text-lg font-semibold text-foreground">
          Payout schedule
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Choose how often Stripe sends your earnings to your bank account.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const selected = kind === opt.kind;
          return (
            <button
              key={opt.kind}
              type="button"
              onClick={() => setKind(opt.kind)}
              className={cn(
                "flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-all",
                selected
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border/50 hover:border-border bg-background"
              )}
              aria-pressed={selected}
            >
              <div
                className={cn(
                  "h-9 w-9 rounded-xl flex items-center justify-center",
                  selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="font-medium text-foreground">{opt.title}</div>
              <div className="text-xs text-muted-foreground leading-snug">
                {opt.subtitle}
              </div>
            </button>
          );
        })}
      </div>

      {kind === "weekly" && (
        <div className="max-w-xs space-y-2">
          <label className="block text-sm font-medium text-foreground">
            Payout day
          </label>
          <Select value={weekday} onValueChange={setWeekday}>
            <SelectTrigger className="rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEEKDAYS.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {kind === "monthly" && (
        <div className="max-w-xs space-y-2">
          <label className="block text-sm font-medium text-foreground">
            Day of month
          </label>
          <Select
            value={String(dayOfMonth)}
            onValueChange={(v) => setDayOfMonth(Number(v))}
          >
            <SelectTrigger className="rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTH_DAYS.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Capped at the 28th so the date is the same every month.
          </p>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving} className="rounded-xl">
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            "Save schedule"
          )}
        </Button>
      </div>
    </section>
  );
}
