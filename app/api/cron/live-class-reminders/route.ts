import { NextRequest, NextResponse } from 'next/server';
import { query, sql } from '@/lib/db';
import { stopRecording as streamHubStopRecording } from '@/lib/stream-hub';
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
  community_name: string;
  community_slug: string;
}

interface CommunityMember {
  user_id: string;
  email: string;
  name: string | null;
}

export const dynamic = 'force-dynamic';

interface StaleLiveClass {
  id: string;
  livekit_room_name: string | null;
}

// Safety net: end live classes that are well past their scheduled end time but
// still marked 'live'. Normally the teacher ends a class via the in-room button,
// but if they close the tab (or the class overruns and the button is gone) it can
// get stuck 'live' forever. A 30-minute grace avoids cutting off classes that run
// a bit over their scheduled duration.
async function endStaleLiveClasses(): Promise<number> {
  const stale = await query<StaleLiveClass>`
    SELECT id, livekit_room_name
    FROM live_classes
    WHERE status = 'live'
      AND scheduled_start_time
          + (duration_minutes || ' minutes')::interval
          + INTERVAL '30 minutes' < NOW()
  `;

  let ended = 0;
  for (const lc of stale ?? []) {
    try {
      await sql`
        UPDATE live_classes SET status = 'ended', updated_at = NOW()
        WHERE id = ${lc.id} AND status = 'live'
      `;
      // Mirror the manual end flow: mark active recordings stopping, then ask
      // the video service to stop the egress (404 is fine if it never started).
      await sql`
        UPDATE live_class_recordings
        SET status = 'stopping', updated_at = NOW()
        WHERE live_class_id = ${lc.id}
          AND status IN ('pending', 'recording')
      `;
      if (lc.livekit_room_name) {
        try {
          await streamHubStopRecording(lc.livekit_room_name);
        } catch (recErr) {
          console.error(`Auto-end: stop recording failed for class ${lc.id} (may already be stopped):`, recErr);
        }
      }
      ended++;
    } catch (err) {
      console.error(`Auto-end: failed to end stale live class ${lc.id}:`, err);
    }
  }
  return ended;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    // Close out any classes that got stuck 'live' past their end time.
    const autoEnded = await endStaleLiveClasses();

    // Find scheduled live classes starting in 25-35 minutes that haven't had reminders sent
    const classes = await query<LiveClass>`
      SELECT
        lc.id,
        lc.community_id,
        lc.teacher_id,
        lc.title,
        lc.scheduled_start_time,
        lc.duration_minutes,
        c.name as community_name,
        c.slug as community_slug
      FROM live_classes lc
      JOIN communities c ON lc.community_id = c.id
      WHERE lc.status = 'scheduled'
        AND lc.reminder_sent_at IS NULL
        AND lc.scheduled_start_time > NOW() + INTERVAL '20 minutes'
        AND lc.scheduled_start_time <= NOW() + INTERVAL '40 minutes'
    `;

    if (!classes || classes.length === 0) {
      return NextResponse.json({ message: 'No classes need reminders', sent: 0, autoEnded });
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
            u.email,
            u.name
          FROM community_members cm
          JOIN "user" u ON cm.user_id = u.id
          WHERE cm.community_id = ${liveClass.community_id}::uuid
            AND cm.status = 'active'
            AND u.email IS NOT NULL
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
            recipientName: member.name || 'Member',
            className: liveClass.title,
            communityName: liveClass.community_name,
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
      autoEnded,
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
