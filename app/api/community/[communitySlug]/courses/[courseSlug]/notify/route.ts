import { NextResponse } from "next/server";
import { Resend } from "resend";
import { query, queryOne } from "@/lib/db";

export const dynamic = 'force-dynamic';

const resend = new Resend(process.env.RESEND_API_KEY);

interface Community {
  id: string;
  name: string;
  created_by: string;
}

interface Course {
  id: string;
  title: string;
  description: string | null;
}

interface Member {
  user_id: string;
}

interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
}

export async function POST(
  req: Request,
  {
    params,
  }: {
    params: { communitySlug: string; courseSlug: string };
  }
) {
  try {
    const community = await queryOne<Community>`
      SELECT id, name, created_by
      FROM communities
      WHERE slug = ${params.communitySlug}
    `;

    if (!community) {
      return NextResponse.json({ error: "Community not found" }, { status: 404 });
    }

    const course = await queryOne<Course>`
      SELECT id, title, description
      FROM courses
      WHERE community_id = ${community.id}
        AND slug = ${params.courseSlug}
    `;

    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    const members = await query<Member>`
      SELECT user_id
      FROM community_members
      WHERE community_id = ${community.id}
        AND user_id != ${community.created_by}
    `;

    if (!members || members.length === 0) {
      return NextResponse.json({
        success: true,
        totalEmails: 0,
        successfulEmails: 0,
        failedEmails: 0,
      });
    }

    const memberIds = members.map((m) => m.user_id);
    const profiles = await query<Profile>`
      SELECT id, email, full_name
      FROM profiles
      WHERE auth_user_id = ANY(${memberIds})
    `;

    const courseUrl = `${process.env.NEXT_PUBLIC_APP_URL}/${params.communitySlug}/classroom/${params.courseSlug}`;

    const emailResults = await Promise.allSettled(
      profiles
        .filter((p): p is Profile & { email: string } => !!p.email)
        .map((profile) =>
          resend.emails.send({
            from: "DanceHub <notifications@dance-hub.io>",
            to: [profile.email],
            subject: `New Course Available: ${course.title}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">New Course Available!</h2>
                <p>Hello ${profile.full_name || 'Member'},</p>
                <p>A new course is now available in your community: <strong>${community.name}</strong></p>
                <p style="font-size: 18px; color: #2563eb; margin: 20px 0;">${course.title}</p>
                <a href="${courseUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">View Course</a>
                <p style="color: #666; font-size: 14px; margin-top: 30px;">
                  This email was sent from DanceHub. If you don't want to receive these emails, you can manage your notification settings in your account.
                </p>
              </div>
            `,
          })
        )
    );

    const failures = emailResults.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      console.error('Some course-notify emails failed:', failures);
    }

    return NextResponse.json({
      success: true,
      totalEmails: emailResults.length,
      successfulEmails: emailResults.length - failures.length,
      failedEmails: failures.length,
    });
  } catch (error) {
    console.error("Error in notify route:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
