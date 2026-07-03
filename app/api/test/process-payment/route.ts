import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { sql, queryOne } from "@/lib/db";
import { createVideoRoomForBooking } from "@/lib/video-room-creation";

interface NewBooking {
  id: string;
}

export async function POST(request: Request) {
  try {
    const { paymentIntentId, stripeAccountId } = await request.json();

    if (!paymentIntentId) {
      return NextResponse.json(
        { error: "Payment Intent ID is required" },
        { status: 400 }
      );
    }

    console.log('🔍 Fetching payment intent from Stripe:', paymentIntentId);

    // Fetch the actual payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(
      paymentIntentId,
      stripeAccountId ? { stripeAccount: stripeAccountId } : undefined
    );

    console.log('💳 Payment Intent metadata:', paymentIntent.metadata);

    if (!paymentIntent.metadata?.type || paymentIntent.metadata.type !== 'private_lesson') {
      return NextResponse.json(
        { error: "Not a private lesson payment" },
        { status: 400 }
      );
    }

    const metadata = paymentIntent.metadata;

    // Validate required metadata
    const requiredFields = ['lesson_id', 'community_id', 'student_id', 'student_email', 'price_paid'];
    for (const field of requiredFields) {
      if (!metadata[field]) {
        return NextResponse.json(
          { error: `Missing required metadata field: ${field}` },
          { status: 400 }
        );
      }
    }

    // Parse contact_info JSON if it exists
    let contactInfo = {};
    try {
      contactInfo = metadata.contact_info ? JSON.parse(metadata.contact_info) : {};
    } catch (e) {
      console.warn('Failed to parse contact_info, using empty object');
    }

    // Create the booking record
    const newBooking = await queryOne<NewBooking>`
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
        student_message,
        contact_info,
        daily_room_name,
        daily_room_url,
        daily_room_created_at,
        daily_room_expires_at,
        teacher_daily_token,
        student_daily_token,
        created_at,
        updated_at
      ) VALUES (
        ${metadata.lesson_id},
        ${metadata.community_id},
        ${metadata.student_id},
        ${metadata.student_email},
        ${metadata.student_name || ''},
        ${metadata.is_member === 'true'},
        ${parseFloat(metadata.price_paid)},
        ${paymentIntentId},
        'succeeded',
        'booked',
        ${metadata.student_message || ''},
        ${sql.json(contactInfo)},
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NOW(),
        NOW()
      )
      RETURNING id
    `;

    if (!newBooking) {
      console.error('❌ Error creating booking record');
      return NextResponse.json(
        { error: 'Failed to create booking' },
        { status: 500 }
      );
    }

    console.log('✅ Successfully created new booking:', newBooking.id);

    // Create video room
    try {
      console.log('🎬 Creating video room for booking:', newBooking.id);
      await createVideoRoomForBooking(newBooking.id);
      console.log('✅ Video room created successfully for booking:', newBooking.id);
    } catch (videoError) {
      console.error('❌ Error creating video room (non-critical):', videoError);
    }

    return NextResponse.json({
      success: true,
      bookingId: newBooking.id,
      paymentIntentId: paymentIntentId,
      message: 'Booking created successfully from payment intent'
    });

  } catch (error) {
    console.error('Error processing payment intent:', error);
    return NextResponse.json(
      { error: `Failed to process payment: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
