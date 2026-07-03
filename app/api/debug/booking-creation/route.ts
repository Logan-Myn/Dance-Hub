import { NextResponse } from 'next/server';
import { sql, queryOne } from '@/lib/db';
import { createVideoRoomForBooking } from '@/lib/video-room-creation';

interface Lesson {
  id: string;
  title: string;
  community_id: string;
}

interface Community {
  id: string;
  name: string;
  slug: string;
}

interface Booking {
  id: string;
  daily_room_name: string | null;
  daily_room_url: string | null;
  [key: string]: unknown;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log('Debug booking creation endpoint hit with body:', JSON.stringify(body, null, 2));

    // Validate required fields
    const requiredFields = ['lesson_id', 'community_id', 'student_id', 'student_email', 'price_paid'];
    for (const field of requiredFields) {
      if (!body[field]) {
        return NextResponse.json(
          {
            error: `Missing required field: ${field}`,
            receivedFields: Object.keys(body)
          },
          { status: 400 }
        );
      }
    }

    // Check if lesson exists
    const lesson = await queryOne<Lesson>`
      SELECT id, title, community_id
      FROM private_lessons
      WHERE id = ${body.lesson_id}
    `;

    if (!lesson) {
      return NextResponse.json(
        {
          error: 'Private lesson not found',
          lesson_id: body.lesson_id
        },
        { status: 404 }
      );
    }

    console.log('Found lesson:', lesson);

    // Check if community exists
    const community = await queryOne<Community>`
      SELECT id, name, slug
      FROM communities
      WHERE id = ${body.community_id}
    `;

    if (!community) {
      return NextResponse.json(
        {
          error: 'Community not found',
          community_id: body.community_id
        },
        { status: 404 }
      );
    }

    console.log('Found community:', community);

    // Parse contact_info JSON if provided
    let contactInfo = {};
    if (body.contact_info) {
      try {
        contactInfo = typeof body.contact_info === 'string'
          ? JSON.parse(body.contact_info)
          : body.contact_info;
      } catch (e) {
        console.warn('Failed to parse contact_info, using empty object');
      }
    }

    console.log('Creating booking with data:', JSON.stringify({
      lesson_id: body.lesson_id,
      community_id: body.community_id,
      student_id: body.student_id,
      price_paid: body.price_paid
    }, null, 2));

    // Create the booking record
    const newBooking = await queryOne<Booking>`
      INSERT INTO lesson_bookings (
        private_lesson_id,
        community_id,
        student_id,
        student_email,
        student_name,
        is_community_member,
        price_paid,
        stripe_payment_intent_id,
        payment_status,
        lesson_status,
        scheduled_at,
        student_message,
        contact_info,
        daily_room_name,
        daily_room_url,
        daily_room_expires_at,
        teacher_daily_token,
        student_daily_token,
        video_call_started_at,
        video_call_ended_at
      ) VALUES (
        ${body.lesson_id},
        ${body.community_id},
        ${body.student_id},
        ${body.student_email},
        ${body.student_name || ''},
        ${body.is_member === 'true' || body.is_member === true},
        ${parseFloat(body.price_paid)},
        ${body.payment_intent_id || `debug_${Date.now()}`},
        'succeeded',
        'scheduled',
        ${body.scheduled_at || null},
        ${body.student_message || ''},
        ${sql.json(contactInfo)},
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL
      )
      RETURNING *
    `;

    if (!newBooking) {
      console.error('Error creating booking record');
      return NextResponse.json(
        {
          error: 'Failed to create booking'
        },
        { status: 500 }
      );
    }

    console.log('Successfully created booking:', newBooking);

    // Create video room
    let videoRoomResult = null;
    try {
      console.log('Creating video room for booking:', newBooking.id);
      await createVideoRoomForBooking(newBooking.id);
      console.log('Video room created successfully');

      // Fetch updated booking with video room data
      const updatedBooking = await queryOne<Booking>`
        SELECT * FROM lesson_bookings WHERE id = ${newBooking.id}
      `;

      videoRoomResult = {
        success: true,
        room_name: updatedBooking?.daily_room_name,
        room_url: updatedBooking?.daily_room_url
      };
    } catch (videoError) {
      console.error('Error creating video room:', videoError);
      videoRoomResult = {
        success: false,
        error: videoError instanceof Error ? videoError.message : String(videoError)
      };
    }

    return NextResponse.json({
      success: true,
      booking: newBooking,
      lesson: lesson,
      community: community,
      videoRoom: videoRoomResult
    });

  } catch (error) {
    console.error('Debug endpoint error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
        stack: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
