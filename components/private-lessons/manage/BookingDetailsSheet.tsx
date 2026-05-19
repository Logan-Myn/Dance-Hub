"use client";

import React from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Mail, Phone, MessageSquare, Video, Calendar } from 'lucide-react';
import Link from 'next/link';
import { formatPrice } from '@/lib/utils';
import {
  PAYMENT_STATUS_BADGE,
  LESSON_STATUS_BADGE,
  LESSON_STATUS_LABEL,
} from '@/lib/private-lessons-display';
import { formatInTz } from '@/lib/timezone';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import type { LessonBookingWithDetails } from '@/types/private-lessons';

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  succeeded: 'Paid',
  pending: 'Pending',
  failed: 'Failed',
  canceled: 'Canceled',
  refunded: 'Refunded',
};

interface BookingDetailsSheetProps {
  booking: LessonBookingWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canJoinVideo: boolean;
  onCancel: () => void;
}

export function BookingDetailsSheet({
  booking,
  open,
  onOpenChange,
  canJoinVideo,
  onCancel,
}: BookingDetailsSheetProps) {
  const tz = useUserTimezone();

  if (!booking) return null;

  let contactInfo: { phone?: string; preferred_contact?: string } = {};
  try {
    contactInfo = booking.contact_info
      ? typeof booking.contact_info === 'string'
        ? JSON.parse(booking.contact_info)
        : booking.contact_info
      : {};
  } catch {}

  const paymentClassName =
    PAYMENT_STATUS_BADGE[booking.payment_status as keyof typeof PAYMENT_STATUS_BADGE];
  const paymentLabel =
    PAYMENT_STATUS_LABEL[booking.payment_status] ?? booking.payment_status;

  const lessonClassName =
    LESSON_STATUS_BADGE[booking.lesson_status as keyof typeof LESSON_STATUS_BADGE];
  const lessonLabel =
    LESSON_STATUS_LABEL[booking.lesson_status] ?? booking.lesson_status;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left">{booking.lesson_title}</SheetTitle>
          <SheetDescription className="text-left flex items-center gap-2 mt-1" asChild>
            <div>
              {paymentClassName && (
                <Badge variant="secondary" className={paymentClassName}>
                  {paymentLabel}
                </Badge>
              )}
              <Badge variant="outline" className={lessonClassName}>
                {lessonLabel}
              </Badge>
            </div>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5 text-sm">
          <section>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
              Scheduled
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              {booking.scheduled_at
                ? formatInTz(new Date(booking.scheduled_at), tz, 'EEE, MMM d · h:mm a')
                : 'No time set'}
            </div>
          </section>

          <section>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
              Student
            </div>
            <div className="font-medium">
              {booking.student_name || booking.student_email}
            </div>
            <div className="flex flex-col gap-1 mt-2 text-muted-foreground">
              {booking.student_email && (
                <a
                  href={`mailto:${booking.student_email}`}
                  className="flex items-center gap-2 hover:text-foreground"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {booking.student_email}
                </a>
              )}
              {contactInfo.phone && (
                <a
                  href={`tel:${contactInfo.phone}`}
                  className="flex items-center gap-2 hover:text-foreground"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {contactInfo.phone}
                </a>
              )}
            </div>
          </section>

          {booking.student_message && (
            <section>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                <MessageSquare className="h-3 w-3" /> Message
              </div>
              <div className="rounded-lg bg-muted/60 p-3 text-foreground/90 whitespace-pre-wrap">
                {booking.student_message}
              </div>
            </section>
          )}

          <section>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
              Payment
            </div>
            <div>{formatPrice(Number(booking.price_paid))} paid</div>
          </section>

          <div className="flex flex-col gap-2 pt-2">
            {canJoinVideo && (
              <Button asChild className="rounded-xl">
                <Link href={`/video-session/${booking.id}`}>
                  <Video className="h-4 w-4 mr-2" />
                  Join video session
                </Link>
              </Button>
            )}
            {(booking.lesson_status === 'booked' ||
              booking.lesson_status === 'scheduled') && (
              <Button
                variant="outline"
                onClick={onCancel}
                className="rounded-xl"
              >
                Cancel booking
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
