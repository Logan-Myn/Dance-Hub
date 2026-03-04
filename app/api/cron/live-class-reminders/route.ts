import { NextRequest, NextResponse } from 'next/server';
import { query, sql } from '@/lib/db';
import { getEmailService } from '@/lib/resend/email-service';
import { LiveClassReminderEmail } from '@/lib/resend/templates/live-class/live-class-reminder';
import React from 'react';

interface LiveClass {
  id: string;
  community_id: string;
  teacher_id: string;
  title: string;
  scheduled_start_time: string;
  duration_minutes: number;
  teacher_name: string;
  community_slug: string;
}

interface CommunityMember {
  user_id: string;
  email: string;
  display_name: string | null;
  full_name: string | null;
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    // Find scheduled live classes starting in 25-35 minutes that haven't had reminders sent
    const classes = await query<LiveClass>`
      SELECT
        lc.id,
        lc.community_id,
        lc.teacher_id,
        lc.title,
        lc.scheduled_start_time,
        lc.duration_minutes,
        p.display_name as teacher_name,
        c.slug as community_slug
      FROM live_classes lc
      JOIN profiles p ON lc.teacher_id = p.id
      JOIN communities c ON lc.community_id = c.id
      WHERE lc.status = 'scheduled'
        AND lc.reminder_sent_at IS NULL
        AND lc.scheduled_start_time > NOW() + INTERVAL '25 minutes'
        AND lc.scheduled_start_time <= NOW() + INTERVAL '35 minutes'
    `;

    if (!classes || classes.length === 0) {
      return NextResponse.json({ message: 'No classes need reminders', sent: 0 });
    }

    const emailService = getEmailService();
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://dance-hub.io';
    let totalSent = 0;
    const results = [];

    for (const liveClass of classes) {
      try {
        // Get all active community members with their emails
        const members = await query<CommunityMember>`
          SELECT
            cm.user_id,
            p.email,
            p.display_name,
            p.full_name
          FROM community_members cm
          JOIN profiles p ON cm.user_id = p.id
          WHERE cm.community_id = ${liveClass.community_id}::uuid
            AND cm.status = 'active'
            AND p.email IS NOT NULL
        `;

        const calendarUrl = `${baseUrl}/${liveClass.community_slug}/calendar`;
        const startTime = new Date(liveClass.scheduled_start_time).toLocaleString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZoneName: 'short',
        });

        const emails = (members || []).map((member) => ({
          to: member.email,
          subject: `Live class "${liveClass.title}" starts in 30 minutes!`,
          react: React.createElement(LiveClassReminderEmail, {
            recipientName: member.display_name || member.full_name || 'Member',
            className: liveClass.title,
            teacherName: liveClass.teacher_name || 'Teacher',
            startTime,
            durationMinutes: liveClass.duration_minutes,
            calendarUrl,
          }),
        }));

        if (emails.length > 0) {
          await emailService.sendBulkEmails(emails);
          totalSent += emails.length;
        }

        // Mark reminder as sent
        await sql`
          UPDATE live_classes
          SET reminder_sent_at = NOW()
          WHERE id = ${liveClass.id}
        `;

        results.push({
          classId: liveClass.id,
          title: liveClass.title,
          emailsSent: emails.length,
        });
      } catch (classError) {
        console.error(`Error processing live class ${liveClass.id}:`, classError);
        results.push({
          classId: liveClass.id,
          title: liveClass.title,
          error: classError instanceof Error ? classError.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      message: 'Live class reminders processed',
      classesProcessed: classes.length,
      totalEmailsSent: totalSent,
      results,
    });
  } catch (error) {
    console.error('Live class reminders cron error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
