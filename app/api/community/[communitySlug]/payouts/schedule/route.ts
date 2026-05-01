import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getSession } from "@/lib/auth-session";
import { queryOne } from "@/lib/db";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-12-15.clover" as Stripe.LatestApiVersion,
});

interface CommunityRow {
  id: string;
  created_by: string;
  stripe_account_id: string | null;
}

const VALID_WEEKDAYS = new Set([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
]);

async function loadCommunityForOwner(
  communitySlug: string,
  userId: string
): Promise<{ row: CommunityRow } | { error: NextResponse }> {
  const row = await queryOne<CommunityRow>`
    SELECT id, created_by, stripe_account_id
    FROM communities
    WHERE slug = ${communitySlug}
  `;
  if (!row) {
    return {
      error: NextResponse.json({ error: "Community not found" }, { status: 404 }),
    };
  }
  if (row.created_by !== userId) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  if (!row.stripe_account_id) {
    return {
      error: NextResponse.json(
        { error: "Stripe account not connected" },
        { status: 400 }
      ),
    };
  }
  return { row };
}

export async function GET(
  _request: Request,
  { params }: { params: { communitySlug: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      console.warn("[payouts/schedule] No session — returning 401");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const result = await loadCommunityForOwner(params.communitySlug, session.user.id);
    if ("error" in result) return result.error;

    const account = await stripe.accounts.retrieve(result.row.stripe_account_id!);
    const schedule = account.settings?.payouts?.schedule;
    return NextResponse.json({
      interval: schedule?.interval ?? "daily",
      delayDays: schedule?.delay_days ?? null,
      weeklyAnchor: schedule?.weekly_anchor ?? null,
      monthlyAnchor: schedule?.monthly_anchor ?? null,
    });
  } catch (error) {
    console.error("Error reading payout schedule:", error);
    return NextResponse.json(
      { error: "Failed to read payout schedule" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { communitySlug: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      console.warn("[payouts/schedule] No session — returning 401");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const result = await loadCommunityForOwner(params.communitySlug, session.user.id);
    if ("error" in result) return result.error;

    const body = await request.json();
    const choice = body?.choice as
      | { kind: "asap" }
      | { kind: "weekly"; weekday: string }
      | { kind: "monthly"; dayOfMonth: number }
      | undefined;

    if (!choice || typeof choice !== "object") {
      return NextResponse.json({ error: "Missing 'choice'" }, { status: 400 });
    }

    let scheduleUpdate: Stripe.AccountUpdateParams.Settings.Payouts.Schedule;
    if (choice.kind === "asap") {
      scheduleUpdate = { interval: "daily", delay_days: "minimum" };
    } else if (choice.kind === "weekly") {
      if (!VALID_WEEKDAYS.has(choice.weekday)) {
        return NextResponse.json(
          { error: "weekday must be monday-friday" },
          { status: 400 }
        );
      }
      scheduleUpdate = {
        interval: "weekly",
        weekly_anchor: choice.weekday as Stripe.AccountUpdateParams.Settings.Payouts.Schedule.WeeklyAnchor,
      };
    } else if (choice.kind === "monthly") {
      const day = Number(choice.dayOfMonth);
      // Cap at 28 so creators don't get the silent "29-31 → last day of month"
      // shift that Stripe applies. If they want end-of-month, we can add a
      // dedicated option later.
      if (!Number.isInteger(day) || day < 1 || day > 28) {
        return NextResponse.json(
          { error: "dayOfMonth must be an integer between 1 and 28" },
          { status: 400 }
        );
      }
      scheduleUpdate = { interval: "monthly", monthly_anchor: day };
    } else {
      return NextResponse.json({ error: "Unknown choice.kind" }, { status: 400 });
    }

    console.log("[payouts/schedule] Updating", {
      slug: params.communitySlug,
      account: result.row.stripe_account_id,
      schedule: scheduleUpdate,
    });

    const updated = await stripe.accounts.update(result.row.stripe_account_id!, {
      settings: { payouts: { schedule: scheduleUpdate } },
    });

    const schedule = updated.settings?.payouts?.schedule;
    return NextResponse.json({
      interval: schedule?.interval ?? "daily",
      delayDays: schedule?.delay_days ?? null,
      weeklyAnchor: schedule?.weekly_anchor ?? null,
      monthlyAnchor: schedule?.monthly_anchor ?? null,
    });
  } catch (error: any) {
    if (error instanceof Stripe.errors.StripeInvalidRequestError) {
      // Country restrictions (e.g. BR/IN forced daily, JP forbids daily) and
      // anything else Stripe rejects — surface the message so the creator
      // sees what's going on.
      return NextResponse.json(
        { error: error.message || "Stripe rejected the schedule update" },
        { status: 400 }
      );
    }
    console.error("Error updating payout schedule:", error);
    return NextResponse.json(
      { error: "Failed to update payout schedule" },
      { status: 500 }
    );
  }
}
