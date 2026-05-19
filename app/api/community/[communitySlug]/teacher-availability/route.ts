import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, sql } from '@/lib/db';
import { getSession } from '@/lib/auth-session';
import { TeacherAvailabilitySlot } from '@/types/private-lessons';

interface Community {
  id: string;
}

interface AvailabilitySlot {
  id: string;
  teacher_id: string;
  community_id: string;
  availability_date: string;
  start_time: string;
  end_time: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface SlotWithBookings extends AvailabilitySlot {
  booking_id: string | null;
  payment_status: string | null;
  teacher_timezone: string;
}

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ communitySlug: string }> }
) {
  const params = await props.params;
  try {
    // Get the current user from Better Auth session
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const user = session.user;

    // Get community ID
    const community = await queryOne<Community>`
      SELECT id
      FROM communities
      WHERE slug = ${params.communitySlug}
    `;

    if (!community) {
      return NextResponse.json({ error: 'Community not found' }, { status: 404 });
    }

    // Get teacher availability slots
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate'); // Optional: filter from this date
    const endDate = searchParams.get('endDate'); // Optional: filter to this date
    const teacherId = searchParams.get('teacher_id'); // Optional: get specific teacher's availability

    // If teacher_id is provided, get that teacher's availability (for students booking)
    // Otherwise, get the current user's availability (for teachers managing their own)
    const targetTeacherId = teacherId || user.id;

    // Build query to get available slots with booking info
    let slots: SlotWithBookings[];

    if (startDate && endDate) {
      slots = await query<SlotWithBookings>`
        SELECT
          tas.*,
          lb.id as booking_id,
          lb.payment_status,
          COALESCE(p.timezone, 'UTC') as teacher_timezone
        FROM teacher_availability_slots tas
        LEFT JOIN lesson_bookings lb
          ON lb.availability_slot_id = tas.id
          AND lb.lesson_status != 'canceled'
        LEFT JOIN profiles p ON p.auth_user_id = tas.teacher_id
        WHERE tas.teacher_id = ${targetTeacherId}
          AND tas.community_id = ${community.id}
          AND tas.is_active = true
          AND tas.availability_date >= ${startDate}
          AND tas.availability_date <= ${endDate}
        ORDER BY tas.availability_date ASC, tas.start_time ASC
      `;
    } else if (startDate) {
      slots = await query<SlotWithBookings>`
        SELECT
          tas.*,
          lb.id as booking_id,
          lb.payment_status,
          COALESCE(p.timezone, 'UTC') as teacher_timezone
        FROM teacher_availability_slots tas
        LEFT JOIN lesson_bookings lb
          ON lb.availability_slot_id = tas.id
          AND lb.lesson_status != 'canceled'
        LEFT JOIN profiles p ON p.auth_user_id = tas.teacher_id
        WHERE tas.teacher_id = ${targetTeacherId}
          AND tas.community_id = ${community.id}
          AND tas.is_active = true
          AND tas.availability_date >= ${startDate}
        ORDER BY tas.availability_date ASC, tas.start_time ASC
      `;
    } else if (endDate) {
      slots = await query<SlotWithBookings>`
        SELECT
          tas.*,
          lb.id as booking_id,
          lb.payment_status,
          COALESCE(p.timezone, 'UTC') as teacher_timezone
        FROM teacher_availability_slots tas
        LEFT JOIN lesson_bookings lb
          ON lb.availability_slot_id = tas.id
          AND lb.lesson_status != 'canceled'
        LEFT JOIN profiles p ON p.auth_user_id = tas.teacher_id
        WHERE tas.teacher_id = ${targetTeacherId}
          AND tas.community_id = ${community.id}
          AND tas.is_active = true
          AND tas.availability_date <= ${endDate}
        ORDER BY tas.availability_date ASC, tas.start_time ASC
      `;
    } else {
      slots = await query<SlotWithBookings>`
        SELECT
          tas.*,
          lb.id as booking_id,
          lb.payment_status,
          COALESCE(p.timezone, 'UTC') as teacher_timezone
        FROM teacher_availability_slots tas
        LEFT JOIN lesson_bookings lb
          ON lb.availability_slot_id = tas.id
          AND lb.lesson_status != 'canceled'
        LEFT JOIN profiles p ON p.auth_user_id = tas.teacher_id
        WHERE tas.teacher_id = ${targetTeacherId}
          AND tas.community_id = ${community.id}
          AND tas.is_active = true
        ORDER BY tas.availability_date ASC, tas.start_time ASC
      `;
    }

    // Filter out slots that have confirmed bookings (payment_status = 'succeeded')
    const availableSlots = (slots || []).filter(slot => {
      // If there's no booking for this slot, it's available
      if (!slot.booking_id) {
        return true;
      }

      // Slot is available only if it doesn't have a confirmed booking
      return slot.payment_status !== 'succeeded';
    }).map(slot => {
      // Remove the booking data from the response to keep it clean
      const { booking_id, payment_status, ...cleanSlot } = slot;

      // Format availability_date to YYYY-MM-DD
      // Neon returns Date objects at runtime even though TypeScript types say string
      let formattedDate: string;
      const dateValue = cleanSlot.availability_date as unknown;
      if (dateValue instanceof Date) {
        // Format Date object manually to avoid timezone issues
        formattedDate = `${dateValue.getFullYear()}-${String(dateValue.getMonth() + 1).padStart(2, '0')}-${String(dateValue.getDate()).padStart(2, '0')}`;
      } else if (typeof dateValue === 'string') {
        // Extract just the date part (first 10 chars of ISO format)
        formattedDate = dateValue.substring(0, 10);
      } else {
        formattedDate = String(dateValue);
      }

      return {
        ...cleanSlot,
        availability_date: formattedDate,
      };
    });

    return NextResponse.json(availableSlots);

  } catch (error) {
    console.error('Error in teacher availability GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ communitySlug: string }> }
) {
  const params = await props.params;
  try {
    // Get the current user from Better Auth session
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const user = session.user;

    // Get community ID
    const community = await queryOne<Community>`
      SELECT id
      FROM communities
      WHERE slug = ${params.communitySlug}
    `;

    if (!community) {
      return NextResponse.json({ error: 'Community not found' }, { status: 404 });
    }

    const body = await request.json();
    const { date, start_time, end_time } = body;

    // Validate input
    if (!date) {
      return NextResponse.json({ error: 'Date is required' }, { status: 400 });
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, { status: 400 });
    }

    // Check if date is in the past
    const selectedDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selectedDate < today) {
      return NextResponse.json({ error: 'Cannot set availability for past dates' }, { status: 400 });
    }

    if (!start_time || !end_time) {
      return NextResponse.json({ error: 'Start time and end time are required' }, { status: 400 });
    }

    // Validate time format (HH:MM)
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(start_time) || !timeRegex.test(end_time)) {
      return NextResponse.json({ error: 'Invalid time format. Use HH:MM format' }, { status: 400 });
    }

    // Check if end time is after start time
    if (start_time >= end_time) {
      return NextResponse.json({ error: 'End time must be after start time' }, { status: 400 });
    }

    // Check for overlapping slots on the same date
    const existingSlots = await query<AvailabilitySlot>`
      SELECT *
      FROM teacher_availability_slots
      WHERE teacher_id = ${user.id}
        AND community_id = ${community.id}
        AND availability_date = ${date}
        AND is_active = true
    `;

    // Check for overlaps
    const hasOverlap = existingSlots?.some((slot: TeacherAvailabilitySlot) => {
      const slotStart = slot.start_time;
      const slotEnd = slot.end_time;
      return (
        (start_time >= slotStart && start_time < slotEnd) ||
        (end_time > slotStart && end_time <= slotEnd) ||
        (start_time <= slotStart && end_time >= slotEnd)
      );
    });

    if (hasOverlap) {
      return NextResponse.json({ error: 'Time slot overlaps with existing availability' }, { status: 400 });
    }

    // Create new availability slot
    const newSlot = await queryOne<AvailabilitySlot>`
      INSERT INTO teacher_availability_slots (
        teacher_id,
        community_id,
        availability_date,
        start_time,
        end_time,
        is_active
      ) VALUES (
        ${user.id},
        ${community.id},
        ${date},
        ${start_time},
        ${end_time},
        true
      )
      RETURNING *
    `;

    if (!newSlot) {
      return NextResponse.json({ error: 'Failed to create availability slot' }, { status: 500 });
    }

    return NextResponse.json(newSlot, { status: 201 });

  } catch (error) {
    console.error('Error in teacher availability POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  _props: { params: Promise<{ communitySlug: string }> }
) {
  try {
    // Get the current user from Better Auth session
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const user = session.user;

    const { searchParams } = new URL(request.url);
    const slotId = searchParams.get('slotId');

    if (!slotId) {
      return NextResponse.json({ error: 'Slot ID is required' }, { status: 400 });
    }

    // Delete the availability slot (soft delete by setting is_active to false)
    await sql`
      UPDATE teacher_availability_slots
      SET is_active = false
      WHERE id = ${slotId}
        AND teacher_id = ${user.id}
    `;

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error in teacher availability DELETE:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
