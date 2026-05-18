import { NextResponse } from "next/server";
import React from "react";
import { queryOne, sql } from "@/lib/db";
import { getSession } from "@/lib/auth-session";
import { stripe } from "@/lib/stripe";
import { getEmailService } from "@/lib/resend/email-service";

const CANCELABLE_STATUSES = new Set(["booked", "scheduled"]);

interface BookingForCancel {
  id: string;
  student_id: string;
  scheduled_at: string | null;
  lesson_status: string;
  payment_status: string;
  price_paid: number;
  stripe_payment_intent_id: string | null;
  availability_slot_id: string | null;
  community_created_by: string;
  community_stripe_account_id: string | null;
  community_name: string;
  lesson_title: string;
  cancellation_cutoff_hours: number;
  late_refund_policy: "refund" | "no_refund";
  student_email: string;
  student_name: string | null;
  teacher_email: string;
  teacher_name: string | null;
  duration_minutes: number;
}

export async function POST(
  _request: Request,
  props: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await props.params;

  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const booking = await queryOne<BookingForCancel>`
    SELECT
      lb.id,
      lb.student_id,
      lb.scheduled_at,
      lb.lesson_status,
      lb.payment_status,
      lb.price_paid,
      lb.stripe_payment_intent_id,
      lb.availability_slot_id,
      lb.student_email,
      lb.student_name,
      pl.title         AS lesson_title,
      pl.duration_minutes,
      pl.cancellation_cutoff_hours,
      pl.late_refund_policy,
      c.created_by        AS community_created_by,
      c.stripe_account_id AS community_stripe_account_id,
      c.name              AS community_name,
      tu.email            AS teacher_email,
      tp.full_name        AS teacher_name
    FROM lesson_bookings lb
    INNER JOIN private_lessons pl ON pl.id = lb.private_lesson_id
    INNER JOIN communities c       ON c.id = pl.community_id
    INNER JOIN "user" tu           ON tu.id = c.created_by
    LEFT JOIN profiles tp          ON tp.auth_user_id = tu.id
    WHERE lb.id = ${bookingId}
  `;

  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const isStudent = booking.student_id === userId;
  const isTeacher = booking.community_created_by === userId;
  if (!isStudent && !isTeacher) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const role: "student" | "teacher" = isTeacher ? "teacher" : "student";

  if (!CANCELABLE_STATUSES.has(booking.lesson_status)) {
    return NextResponse.json(
      { error: "Booking not cancelable" },
      { status: 409 }
    );
  }

  const scheduledMs = booking.scheduled_at
    ? new Date(booking.scheduled_at).getTime()
    : null;
  const nowMs = Date.now();
  if (scheduledMs !== null && nowMs >= scheduledMs) {
    return NextResponse.json(
      { error: "Lesson has already started or ended" },
      { status: 409 }
    );
  }

  // Decide refund amount
  const priceCents = Math.round(Number(booking.price_paid) * 100);
  let refundCents = 0;
  if (role === "teacher") {
    refundCents = priceCents;
  } else if (scheduledMs !== null) {
    const cutoffMs = scheduledMs - booking.cancellation_cutoff_hours * 3600_000;
    const beforeCutoff = nowMs <= cutoffMs;
    if (beforeCutoff || booking.late_refund_policy === "refund") {
      refundCents = priceCents;
    }
  }

  // Stripe refund (if applicable)
  let refundId: string | null = null;
  const owedARefund = refundCents > 0 && !!booking.stripe_payment_intent_id;

  if (owedARefund) {
    if (!booking.community_stripe_account_id) {
      console.error("[cancel] missing Stripe account on community, refund not issued", { bookingId });
      return NextResponse.json(
        { error: "refund_failed", message: "Could not issue refund. Try again or contact support." },
        { status: 502 }
      );
    }
    try {
      const refund = await stripe.refunds.create(
        {
          payment_intent: booking.stripe_payment_intent_id!,
          refund_application_fee: true,
        },
        { stripeAccount: booking.community_stripe_account_id }
      );
      refundId = refund.id;
    } catch (err) {
      console.error("[cancel] Stripe refund failed", { bookingId, err });
      return NextResponse.json(
        { error: "refund_failed", message: "Could not issue refund. Try again or contact support." },
        { status: 502 }
      );
    }
  } else {
    refundCents = 0;
  }

  // DB update
  const newPaymentStatus = refundCents > 0 ? "refunded" : booking.payment_status;
  await sql`
    UPDATE lesson_bookings
    SET
      lesson_status        = 'canceled',
      payment_status       = ${newPaymentStatus},
      canceled_at          = NOW(),
      canceled_by          = ${role},
      availability_slot_id = NULL,
      updated_at           = NOW()
    WHERE id = ${bookingId}
  `;

  try {
    const emailService = getEmailService();
    const lessonDate = booking.scheduled_at
      ? new Date(booking.scheduled_at).toLocaleString('en-GB', {
          dateStyle: 'long',
          timeStyle: 'short',
        })
      : 'the scheduled date';
    const refundedAmount = refundCents / 100;
    if (role === 'student') {
      const { CancellationByStudentEmail } = await import(
        '@/lib/resend/templates/booking/cancellation-by-student'
      );
      await emailService.sendNotificationEmail(
        booking.teacher_email,
        `Booking canceled: ${booking.lesson_title}`,
        React.createElement(CancellationByStudentEmail, {
          teacherName: booking.teacher_name ?? 'there',
          studentName: booking.student_name ?? booking.student_email,
          lessonTitle: booking.lesson_title,
          lessonDate,
          refundedAmount,
          currency: 'eur',
          wasRefunded: refundCents > 0,
        })
      );
    } else {
      const { CancellationByTeacherEmail } = await import(
        '@/lib/resend/templates/booking/cancellation-by-teacher'
      );
      await emailService.sendNotificationEmail(
        booking.student_email,
        `Your lesson was canceled`,
        React.createElement(CancellationByTeacherEmail, {
          studentName: booking.student_name ?? 'there',
          communityName: booking.community_name,
          lessonTitle: booking.lesson_title,
          lessonDate,
          refundedAmount,
          currency: 'eur',
        })
      );
    }
  } catch (err) {
    console.error('[cancel] email dispatch failed', { bookingId, err });
  }

  return NextResponse.json({
    status: "canceled",
    refunded_amount_cents: refundCents,
    refund_id: refundId,
  });
}
