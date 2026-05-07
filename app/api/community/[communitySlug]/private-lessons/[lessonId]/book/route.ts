import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { getSession } from "@/lib/auth-session";
import { CreateLessonBookingData } from "@/types/private-lessons";

interface Community {
  id: string;
  name: string;
  stripe_account_id: string | null;
  created_by: string;
}

interface Lesson {
  id: string;
  title: string;
  regular_price: number;
  member_price: number | null;
  is_active: boolean;
}

interface Membership {
  id: string;
}

export async function POST(
  request: Request,
  props: { params: Promise<{ communitySlug: string; lessonId: string }> }
) {
  const params = await props.params;
  try {
    const { communitySlug, lessonId } = params;
    const bookingData: CreateLessonBookingData = await request.json();

    // Get the current user from Better Auth session
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const user = session.user;

    // Get community with Stripe account info
    const community = await queryOne<Community>`
      SELECT id, name, stripe_account_id, created_by
      FROM communities
      WHERE slug = ${communitySlug}
    `;

    if (!community) {
      return NextResponse.json(
        { error: "Community not found" },
        { status: 404 }
      );
    }

    if (!community.stripe_account_id) {
      return NextResponse.json(
        { error: "Community payment processing not set up" },
        { status: 400 }
      );
    }

    // Get the private lesson
    const lesson = await queryOne<Lesson>`
      SELECT id, title, regular_price, member_price, is_active
      FROM private_lessons
      WHERE id = ${lessonId}
        AND community_id = ${community.id}
        AND is_active = true
    `;

    if (!lesson) {
      return NextResponse.json(
        { error: "Private lesson not found or not available" },
        { status: 404 }
      );
    }

    // Check if user is a community member
    const membership = await queryOne<Membership>`
      SELECT id
      FROM community_members
      WHERE community_id = ${community.id}
        AND user_id = ${user.id}
        AND status = 'active'
    `;

    const isMember = !!membership;
    const price = isMember && lesson.member_price ? lesson.member_price : lesson.regular_price;

    // Validate booking data
    if (!bookingData.student_email) {
      return NextResponse.json(
        { error: "Student email is required" },
        { status: 400 }
      );
    }

    if (!bookingData.scheduled_at) {
      return NextResponse.json(
        { error: "Scheduled time is required" },
        { status: 400 }
      );
    }

    // Store booking data in PaymentIntent metadata for webhook processing
    const privateLessonFeePercentage = 5.0; // 5% platform fee for private lessons

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: Math.round(price * 100), // Convert to cents
        currency: "eur",
        application_fee_amount: Math.round((price * privateLessonFeePercentage / 100) * 100), // 5% platform fee in cents
        metadata: {
          type: "private_lesson",
          lesson_id: lessonId,
          community_id: community.id,
          student_id: user.id,
          student_email: bookingData.student_email,
          student_name: bookingData.student_name || "",
          student_message: bookingData.student_message || "",
          contact_info: JSON.stringify(bookingData.contact_info || {}),
          scheduled_at: bookingData.scheduled_at,
          availability_slot_id: bookingData.availability_slot_id || "",
          is_member: isMember.toString(),
          price_paid: price.toString(),
          platform_fee_percentage: privateLessonFeePercentage.toString(),
          platform_fee_amount: (price * privateLessonFeePercentage / 100).toString(),
        },
        description: `Private Lesson: ${lesson.title} - ${community.name}`,
        receipt_email: bookingData.student_email,
      },
      {
        stripeAccount: community.stripe_account_id,
      }
    );

    // Return only payment information - no booking created yet!
    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      stripeAccountId: community.stripe_account_id,
      paymentIntentId: paymentIntent.id,
      lesson: {
        title: lesson.title,
        price: price,
        isMember: isMember
      }
    });
  } catch (error) {
    console.error("Error in POST /api/community/[communitySlug]/private-lessons/[lessonId]/book:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
