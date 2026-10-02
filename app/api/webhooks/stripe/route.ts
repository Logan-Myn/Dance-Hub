import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { stripe, STRIPE_API_VERSION } from '@/lib/stripe';
import { query, queryOne, sql } from '@/lib/db';
import { getEmailService } from '@/lib/resend/email-service';
import { BookingConfirmationEmail } from '@/lib/resend/templates/booking/booking-confirmation';
import { TeacherBookingNotificationEmail } from '@/lib/resend/templates/booking/teacher-booking-notification';
import { PaymentReceiptEmail } from '@/lib/resend/templates/booking/payment-receipt';
import { MemberWelcomeEmail } from '@/lib/resend/templates/community/member-welcome';
import { CommunityOpeningEmail } from '@/lib/resend/templates/community/community-opening';
import { recordBroadcastSubscription } from '@/lib/broadcasts/billing';
import { claimWebhookEvent, finishWebhookEvent } from '@/lib/stripe-webhook-events';
import { LIVE_SUBSCRIPTION_STATUSES, memberSubscriptionStatus } from '@/lib/membership-ended';
import { isInLaunchPromo, membershipFeePercentage } from '@/lib/platform-fees';
import React from 'react';
import Stripe from 'stripe';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
const connectWebhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET!;

// Environment validation
if (!webhookSecret) {
  console.error('❌ STRIPE_WEBHOOK_SECRET is not set');
}
if (!connectWebhookSecret) {
  console.error('❌ STRIPE_CONNECT_WEBHOOK_SECRET is not set');
}
if (!process.env.STRIPE_SECRET_KEY) {
  console.error('❌ STRIPE_SECRET_KEY is not set');
}

interface LessonBooking {
  id: string;
}

interface PrivateLessonDetails {
  title: string;
  duration: number;
  teacher_id: string;
}

interface TeacherProfile {
  display_name: string | null;
  full_name: string | null;
  email: string | null;
}

interface Community {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  membership_price: number | null;
  created_at: string;
  active_member_count: number;
  status: string;
  opening_date: string | null;
}

interface UserProfile {
  full_name: string | null;
  email: string | null;
}

async function handleBroadcastCheckoutCompleted(session: Stripe.Checkout.Session) {
  if (session.metadata?.purpose !== 'broadcast_subscription') return;
  const communityId = session.metadata?.communityId;
  if (!communityId) {
    console.error('[Broadcast sub] missing communityId in metadata');
    return;
  }
  const subscriptionId = session.subscription as string;
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  await recordBroadcastSubscription(communityId, sub);
}

async function handleBroadcastSubscriptionLifecycle(sub: Stripe.Subscription): Promise<boolean> {
  if (sub.metadata?.purpose !== 'broadcast_subscription') return false;
  const communityId = sub.metadata?.communityId;
  if (communityId) {
    // Deleting a community cancels its broadcast subscription, and the
    // resulting event arrives after the community row (and this row, by
    // cascade) is gone. Inserting it again would hit the foreign key and make
    // Stripe retry for days, so there is nothing to record.
    const community = await queryOne<{ id: string }>`
      SELECT id FROM communities WHERE id = ${communityId}
    `;
    if (!community) {
      console.log('⏭️ Broadcast subscription event for a deleted community, skipping:', sub.id);
      return true;
    }
  }
  // Status mapped onto the table's set; events for a subscription other than
  // the community's current one are ignored unless it becomes active.
  if ((await recordBroadcastSubscription(communityId, sub)) === 'ignored') {
    console.log('⏭️ Event for a broadcast subscription the community no longer uses, skipping:', sub.id);
  }
  return true;
}

/** Broadcast tier subscriptions live on the platform account and carry no member metadata. */
function isBroadcastSubscription(sub: Stripe.Subscription): boolean {
  return sub.metadata?.purpose === 'broadcast_subscription';
}

/**
 * What applyPaidMembership did. 'retry' means the member's row exists but
 * join-paid hasn't written this subscription's id onto it yet; the caller
 * answers 503 so Stripe delivers the event again.
 */
type PaidMembershipResult = 'applied' | 'retry';

/**
 * Brings the member row in line with a paid membership subscription. Access
 * follows the subscription's live status, so a late or replayed invoice for a
 * subscription that has since ended can't re-grant it. Rows are matched on
 * the subscription id, so events for a replaced subscription never touch the
 * member's current row. The welcome (or "now open") email goes out only when
 * this payment is what made the row active, not on renewals or upgrades.
 */
async function applyPaidMembership(
  connectedStripe: Stripe,
  subscription: Stripe.Subscription,
): Promise<PaidMembershipResult> {
  const { user_id, community_id } = subscription.metadata;
  console.log('🔍 Processing invoice payment for:', { user_id, community_id });

  // Check if this member should transition from promotional to standard pricing
  const community = await queryOne<Community>`
    SELECT id, name, slug, description, image_url, membership_price, created_at, active_member_count, status, opening_date
    FROM communities
    WHERE id = ${community_id}
  `;
  if (!community) return 'applied';

  const isStillPromotional = isInLaunchPromo(community.created_at);
  const newFeePercentage = membershipFeePercentage(community);
  if (!isStillPromotional) {
    // Update the subscription's application fee if it has changed
    if (subscription.application_fee_percent !== newFeePercentage) {
      console.log(`🔄 Updating subscription ${subscription.id} fee from ${subscription.application_fee_percent}% to ${newFeePercentage}%`);

      await connectedStripe.subscriptions.update(subscription.id, {
        application_fee_percent: newFeePercentage,
        metadata: {
          ...subscription.metadata,
          fee_updated_at: new Date().toISOString(),
          previous_fee: subscription.application_fee_percent?.toString() || '0'
        }
      });
    }
  }

  // Check if this is a pre-registration payment and community should be activated
  const isPreRegistration = subscription.metadata?.is_pre_registration === 'true';
  let communityJustOpened = false;

  if (isPreRegistration && community.status === 'pre_registration') {
    const now = new Date();
    const openingDate = community.opening_date ? new Date(community.opening_date) : null;

    // If opening date has passed, activate the community
    if (openingDate && openingDate <= now) {
      console.log('🚀 Activating community after pre-registration payment');
      await sql`
        UPDATE communities
        SET status = 'active'
        WHERE id = ${community_id}
      `;
      console.log('✅ Community status updated to active');
      communityJustOpened = true;
    }
  }

  // A pre-registration subscription can report a payment (a €0 first invoice)
  // before the community opens. The member stays pre-registered until then.
  const waitingForOpening =
    isPreRegistration && community.status === 'pre_registration' && !communityJustOpened;
  const grantsAccess =
    LIVE_SUBSCRIPTION_STATUSES.includes(subscription.status) && !waitingForOpening;

  // Update member status and platform fee percentage. The CTE reads the row's
  // status before the update (and locks it), so a concurrent delivery of a
  // related event can't also see the transition.
  const [row] = await sql<{ previous_status: string; status: string }[]>`
    WITH prev AS (
      SELECT id, status
      FROM community_members
      WHERE community_id = ${community_id}
        AND user_id = ${user_id}
        AND stripe_subscription_id = ${subscription.id}
      FOR UPDATE
    )
    UPDATE community_members cm
    SET
      status = COALESCE(${grantsAccess ? 'active' : null}, cm.status),
      subscription_status = ${memberSubscriptionStatus(subscription)},
      platform_fee_percentage = ${isStillPromotional ? 0 : newFeePercentage}
    FROM prev
    WHERE cm.id = prev.id
    RETURNING prev.status AS previous_status, cm.status
  `;

  if (!row) {
    // join-paid inserts a pending row, creates the subscription, then writes
    // its id onto the row. A fully-discounted first invoice is paid (and can
    // be reported) in between. A pending row with no subscription id that is
    // younger than join-paid's 2-minute abandon limit is that join: retry.
    const [joining] = await sql<{ id: string }[]>`
      SELECT id FROM community_members
      WHERE community_id = ${community_id}
        AND user_id = ${user_id}
        AND status = 'pending'
        AND stripe_subscription_id IS NULL
        AND joined_at > NOW() - INTERVAL '2 minutes'
    `;
    if (joining) {
      console.log('⏳ Member row not linked to the subscription yet, asking for a retry:', subscription.id);
      return 'retry';
    }
    console.warn('⚠️ No member row for this subscription:', { subscriptionId: subscription.id, community_id, user_id });
    return 'applied';
  }

  // Renewals, the upgrade proration and replays find the row already active.
  // The members_count column is kept by a trigger on community_members
  // (row insert/delete), so there is nothing to count here.
  const becameMember = row.previous_status !== 'active' && row.status === 'active';
  if (!becameMember) return 'applied';

  // Get user profile for email
  const userProfile = await queryOne<UserProfile>`
    SELECT full_name, email
    FROM profiles
    WHERE auth_user_id = ${user_id}
  `;

  // Send appropriate welcome email
  if (userProfile?.email) {
    try {
      const emailService = getEmailService();
      const communityUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://dance-hub.io'}/${community.slug}`;
      const memberName = userProfile.full_name || 'there';

      const defaultBenefits = [
        'Access to all community courses and content',
        'Join live dance classes',
        'Connect with fellow dancers',
        'Exclusive member resources',
      ];

      const nextSteps = [
        {
          title: 'Explore the Classroom',
          description: 'Check out available courses and start learning',
          url: `${communityUrl}/classroom`,
        },
        {
          title: 'Join Live Classes',
          description: 'See the calendar for upcoming live sessions',
          url: `${communityUrl}/calendar`,
        },
        {
          title: 'Meet the Community',
          description: 'Introduce yourself in the community feed',
          url: communityUrl,
        },
      ];

      if (communityJustOpened || isPreRegistration) {
        // Send Community Opening email for pre-registration members
        await emailService.sendNotificationEmail(
          userProfile.email,
          `${community.name} is Now Open!`,
          React.createElement(CommunityOpeningEmail, {
            memberName,
            communityName: community.name,
            communityDescription: community.description || undefined,
            communityUrl,
            membershipPrice: (community.membership_price || 0) * 100,
            currency: 'EUR',
            benefits: defaultBenefits,
            nextSteps,
          })
        );
        console.log('✅ Community opening email sent to:', userProfile.email);
      } else {
        // Send Member Welcome email for regular new members
        await emailService.sendNotificationEmail(
          userProfile.email,
          `Welcome to ${community.name}!`,
          React.createElement(MemberWelcomeEmail, {
            memberName,
            communityName: community.name,
            communityLogo: community.image_url || undefined,
            communityUrl,
          })
        );
        console.log('✅ Member welcome email sent to:', userProfile.email);
      }
    } catch (emailError) {
      console.error('❌ Error sending welcome email (non-critical):', emailError);
      // Don't fail the webhook for email errors
    }
  }
  return 'applied';
}

const retryLater = () =>
  NextResponse.json({ error: 'Member row not ready yet, retry later' }, { status: 503 });

export async function POST(request: Request) {
  try {
    console.log('🎯🎯🎯 WEBHOOK ENDPOINT HIT - TIMESTAMP:', new Date().toISOString());
    const body = await request.text();
    const signature = (await headers()).get('stripe-signature')!;
    console.log('📝 Got signature:', signature ? 'Yes' : 'No');
    console.log('📝 Request body length:', body.length);

    let event: Stripe.Event;

    try {
      // First try platform webhook secret, then Connect if it fails
      let secret = webhookSecret;
      let isConnectEvent = false;

      try {
        console.log('🔐 Trying platform webhook secret first');
        event = stripe.webhooks.constructEvent(body, signature, secret);
        console.log('✅ Platform webhook verified, event type:', event.type);
      } catch (platformError) {
        console.log('⚠️ Platform webhook failed, trying Connect webhook secret');
        console.log('Platform error:', (platformError as Error).message);

        if (!connectWebhookSecret) {
          throw new Error('Connect webhook secret not configured');
        }

        secret = connectWebhookSecret;
        isConnectEvent = true;
        event = stripe.webhooks.constructEvent(body, signature, secret);
        console.log('✅ Connect webhook verified, event type:', event.type);
      }

      console.log('📋 Event details:', {
        id: event.id,
        type: event.type,
        account: event.account,
        isConnectEvent,
        created: event.created
      });
    } catch (err) {
      console.error('❌ Webhook signature verification failed with both secrets:', err);
      console.error('Error details:', {
        message: (err as Error).message,
        webhookSecretExists: !!webhookSecret,
        connectWebhookSecretExists: !!connectWebhookSecret,
        signatureExists: !!signature,
        bodyLength: body.length
      });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    // Stripe redelivers an event after a timeout or a non-2xx. Skip one that
    // was already handled; ask Stripe to retry one another attempt is still
    // handling (if that attempt fails, the retry runs it again).
    const claim = await claimWebhookEvent(event);
    if (claim === 'duplicate') {
      console.log('⏭️ Event already processed, skipping:', event.id);
      return NextResponse.json({ received: true, duplicate: true });
    }
    if (claim === 'in_progress') {
      console.log('⏳ Event is being processed by another attempt:', event.id);
      return NextResponse.json({ error: 'Event is already being processed' }, { status: 409 });
    }

    const response = await handleEvent(event);
    await finishWebhookEvent(event.id, response.ok);
    return response;
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

// Runs the handler for a verified event. Never throws: any error becomes a
// 500, so the caller can release the event claim and Stripe retries it.
async function handleEvent(event: Stripe.Event): Promise<NextResponse> {
  try {
    console.log('Received webhook event:', event.type);

    const connectedStripe = event.account
      ? new Stripe(process.env.STRIPE_SECRET_KEY!, {
          apiVersion: STRIPE_API_VERSION,
          stripeAccount: event.account,
        })
      : stripe;

    const { stripe_account_id } = (event.data.object as any).metadata || {};

    switch (event.type) {
      case 'setup_intent.succeeded': {
        // A promo-code join with a fully-discounted (€0) first invoice collects
        // a card via a SetupIntent instead of a payment. Attach that card to the
        // subscription so later full-price renewals can charge off-session.
        const si = event.data.object as Stripe.SetupIntent;
        const subscriptionId = si.metadata?.subscription_id;
        if (subscriptionId && si.payment_method) {
          try {
            await connectedStripe.subscriptions.update(subscriptionId, {
              default_payment_method: si.payment_method as string,
            });
          } catch (err) {
            console.error('[webhook] failed to set default payment method from setup intent', err);
          }
        }
        break;
      }
      case 'payment_intent.succeeded':
        console.log('💳 Payment intent succeeded');
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log('💳 Payment Intent ID:', paymentIntent.id);
        console.log('💳 Metadata:', paymentIntent.metadata);
        console.log('💳 Is Connect event:', !!event.account);
        console.log('💳 Event account:', event.account);
        console.log('💳 Metadata type:', paymentIntent.metadata?.type);

        // Handle private lesson payments
        console.log('🧪 Checking conditions:');
        console.log('  - Has event.account:', !!event.account);
        console.log('  - Metadata type:', paymentIntent.metadata?.type);
        console.log('  - Type matches:', paymentIntent.metadata?.type === 'private_lesson');

        if (event.account && paymentIntent.metadata?.type === 'private_lesson') {
          console.log('🎓 Processing private lesson payment');
          const metadata = paymentIntent.metadata;

          console.log('📋 Full payment intent metadata:', JSON.stringify(metadata, null, 2));

          // Validate required metadata
          const requiredFields = ['lesson_id', 'community_id', 'student_id', 'student_email', 'price_paid'];
          const missingFields = [];

          for (const field of requiredFields) {
            if (!metadata[field]) {
              missingFields.push(field);
            }
          }

          if (missingFields.length > 0) {
            console.error('❌ Missing required metadata fields:', missingFields);
            console.error('📋 Available metadata:', Object.keys(metadata || {}));
            return NextResponse.json({
              error: `Missing private lesson metadata: ${missingFields.join(', ')}`,
              availableFields: Object.keys(metadata || {}),
              paymentIntentId: paymentIntent.id
            }, { status: 400 });
          }

          try {
            // Parse contact_info JSON if it exists
            let contactInfo = {};
            try {
              contactInfo = metadata.contact_info ? JSON.parse(metadata.contact_info) : {};
            } catch (e) {
              console.warn('Failed to parse contact_info, using empty object');
            }

            // Create the booking record. A redelivered event finds the booking
            // already there (stripe_payment_intent_id is unique) and stops.
            const newBooking = await queryOne<LessonBooking>`
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
                availability_slot_id,
                student_message,
                contact_info,
                video_call_started_at,
                video_call_ended_at
              ) VALUES (
                ${metadata.lesson_id},
                ${metadata.community_id},
                ${metadata.student_id},
                ${metadata.student_email},
                ${metadata.student_name || ''},
                ${metadata.is_member === 'true'},
                ${parseFloat(metadata.price_paid)},
                ${paymentIntent.id},
                'succeeded',
                'scheduled',
                ${metadata.scheduled_at || null},
                ${metadata.availability_slot_id || null},
                ${metadata.student_message || ''},
                ${sql.json(contactInfo)},
                NULL,
                NULL
              )
              ON CONFLICT (stripe_payment_intent_id) DO NOTHING
              RETURNING id
            `;

            if (!newBooking) {
              console.log('⏭️ Booking already recorded for payment intent:', paymentIntent.id);
              return NextResponse.json({ received: true, duplicate: true });
            }

            console.log('✅ Successfully created new booking:', newBooking.id);

            // Get lesson details
            const lessonDetails = await queryOne<PrivateLessonDetails>`
              SELECT title, duration_minutes as duration, teacher_id
              FROM private_lessons
              WHERE id = ${metadata.lesson_id}
            `;

            // Get teacher profile (teacher_id is Better Auth ID, stored as auth_user_id in profiles)
            let teacherProfile: TeacherProfile | null = null;
            if (lessonDetails?.teacher_id) {
              teacherProfile = await queryOne<TeacherProfile>`
                SELECT display_name, full_name, email
                FROM profiles
                WHERE auth_user_id = ${lessonDetails.teacher_id}
              `;
            }

            // Get student profile so the emails can greet them by their real
            // name when the booking form's optional 'Full Name' field is blank.
            let studentProfile: TeacherProfile | null = null;
            if (metadata.student_id) {
              studentProfile = await queryOne<TeacherProfile>`
                SELECT display_name, full_name, email
                FROM profiles
                WHERE auth_user_id = ${metadata.student_id}
              `;
            }
            const studentDisplayName =
              metadata.student_name?.trim() ||
              studentProfile?.display_name ||
              studentProfile?.full_name ||
              'Student';

            // Video session uses LiveKit and is provisioned lazily on first
            // /video-token request. The email's "Join" link points at the
            // in-app session page, which mounts LiveKitVideoCall.
            const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://dance-hub.io';
            const videoRoomUrl = `${appBaseUrl}/video-session/${newBooking.id}`;

            try {
              const emailService = getEmailService();
              const scheduledDate = metadata.scheduled_at ? new Date(metadata.scheduled_at) : new Date();
              const formattedDate = scheduledDate.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              });
              const formattedTime = scheduledDate.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
              });

              const teacherName = teacherProfile?.display_name || teacherProfile?.full_name || 'Teacher';
              const teacherEmail = teacherProfile?.email;
              const pricePaid = parseFloat(metadata.price_paid);
              const lessonTitle = lessonDetails?.title || 'Private Lesson';

              const emailJobs: Promise<unknown>[] = [
                emailService.sendNotificationEmail(
                  metadata.student_email,
                  `Booking Confirmed: ${lessonTitle}`,
                  React.createElement(BookingConfirmationEmail, {
                    studentName: studentDisplayName,
                    teacherName,
                    lessonTitle,
                    lessonDate: formattedDate,
                    lessonTime: formattedTime,
                    duration: lessonDetails?.duration || 60,
                    price: pricePaid,
                    videoRoomUrl,
                    bookingId: newBooking.id,
                    paymentMethod: 'Card',
                  })
                ),
                emailService.sendNotificationEmail(
                  metadata.student_email,
                  `Payment Receipt #${paymentIntent.id.slice(-8).toUpperCase()}`,
                  React.createElement(PaymentReceiptEmail, {
                    recipientName: studentDisplayName,
                    receiptNumber: paymentIntent.id.slice(-8).toUpperCase(),
                    paymentDate: new Date().toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    }),
                    paymentMethod: 'Credit Card',
                    items: [{
                      description: `${lessonTitle} with ${teacherName}`,
                      quantity: 1,
                      price: pricePaid,
                      total: pricePaid,
                    }],
                    subtotal: pricePaid,
                    total: pricePaid,
                    currency: 'EUR',
                  })
                ),
              ];

              if (teacherEmail) {
                emailJobs.push(
                  emailService.sendNotificationEmail(
                    teacherEmail,
                    `New booking: ${studentDisplayName} booked ${lessonTitle}`,
                    React.createElement(TeacherBookingNotificationEmail, {
                      teacherName,
                      studentName: studentDisplayName,
                      lessonTitle,
                      lessonDate: formattedDate,
                      lessonTime: formattedTime,
                      duration: lessonDetails?.duration || 60,
                      videoRoomUrl,
                      bookingId: newBooking.id,
                    })
                  )
                );
              }

              const results = await Promise.allSettled(emailJobs);
              results.forEach((r, i) => {
                if (r.status === 'rejected') {
                  console.error(`❌ Booking email ${i} failed:`, r.reason);
                }
              });
            } catch (emailError) {
              console.error('❌ Error sending booking emails (non-critical):', emailError);
            }

            return NextResponse.json({ received: true });
          } catch (error) {
            console.error('❌ Error in private lesson payment handler:', error);
            return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
          }
        }

        // For Connect events, metadata is on the subscription
        if (event.account && paymentIntent.invoice) {
          console.log('🔍 Getting subscription details for invoice:', paymentIntent.invoice);
          const piInvoice = await connectedStripe.invoices.retrieve(paymentIntent.invoice as string);
          // In Clover API, subscription is now in parent.subscription_details.subscription
          const piInvoiceParent = (piInvoice as any).parent;
          const piSubscriptionId = piInvoiceParent?.subscription_details?.subscription || piInvoice.subscription;

          if (!piSubscriptionId) {
            console.log('⚠️ No subscription associated with payment intent invoice');
            return NextResponse.json({ received: true });
          }

          const subscription = await connectedStripe.subscriptions.retrieve(piSubscriptionId as string);

          if (!subscription.metadata?.user_id || !subscription.metadata?.community_id) {
            console.error('Missing metadata in subscription:', subscription.id);
            return NextResponse.json({ error: 'Missing metadata' }, { status: 400 });
          }

          const { user_id, community_id } = subscription.metadata;
          console.log('🔍 Found metadata from subscription:', { user_id, community_id });

          try {
            // Payment intents carry no invoice from API version
            // 2025-03-31.basil on, so this branch only runs for older payload
            // versions. It uses the same path as invoice.payment_succeeded,
            // so it can't activate the member or email them a second time.
            if ((await applyPaidMembership(connectedStripe, subscription)) === 'retry') {
              return retryLater();
            }

            console.log('✅ Successfully updated member status');
            return NextResponse.json({ received: true });
          } catch (error) {
            console.error('❌ Error in payment_intent.succeeded handler:', error);
            return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
          }
        }

        // For direct payments, metadata is on the payment intent
        if (!event.account && (!paymentIntent.metadata?.user_id || !paymentIntent.metadata?.community_id)) {
          console.error('Missing metadata in payment intent:', {
            id: paymentIntent.id,
            metadata: paymentIntent.metadata
          });
          return NextResponse.json({ error: 'Missing metadata' }, { status: 400 });
        }

        break;

      case 'invoice.created': {
        console.log('📝 Invoice created (draft) — checking platform fee');
        const draftInvoice = event.data.object as Stripe.Invoice;

        // In Clover API, subscription is in parent.subscription_details.subscription
        const draftInvoiceParent = (draftInvoice as any).parent;
        const draftSubscriptionId = draftInvoiceParent?.subscription_details?.subscription || (draftInvoice as any).subscription;

        if (!draftSubscriptionId) {
          console.log('⚠️ invoice.created: no subscription attached, skipping');
          return NextResponse.json({ received: true });
        }

        try {
          const draftSub = await connectedStripe.subscriptions.retrieve(draftSubscriptionId as string);
          const draftCommunityId = draftSub.metadata?.community_id;

          if (!draftCommunityId) {
            console.log('⚠️ invoice.created: sub has no community_id metadata, skipping');
            return NextResponse.json({ received: true });
          }

          const draftCommunity = await queryOne<Community>`
            SELECT id, name, slug, description, image_url, membership_price, created_at, active_member_count, status, opening_date
            FROM communities
            WHERE id = ${draftCommunityId}
          `;

          if (!draftCommunity) {
            console.log('⚠️ invoice.created: community not found, skipping');
            return NextResponse.json({ received: true });
          }

          // Compute correct fee % based on community grace period + tier
          const draftFeePercentage = membershipFeePercentage(draftCommunity);

          // Update the invoice's application_fee_amount directly (only possible while draft)
          // This ensures the CURRENT cycle gets the correct fee, not just future ones.
          const draftAmountDue = draftInvoice.amount_due || 0;
          const correctFeeAmount = Math.round(draftAmountDue * (draftFeePercentage / 100));
          const currentFeeAmount = draftInvoice.application_fee_amount || 0;

          if (draftInvoice.status === 'draft' && currentFeeAmount !== correctFeeAmount) {
            console.log(`🔄 Updating draft invoice ${draftInvoice.id} application_fee_amount from ${currentFeeAmount} to ${correctFeeAmount} (${draftFeePercentage}% of ${draftAmountDue})`);
            await connectedStripe.invoices.update(draftInvoice.id as string, {
              application_fee_amount: correctFeeAmount,
            });
          } else if (draftInvoice.status !== 'draft') {
            console.log(`⚠️ invoice.created: invoice status is ${draftInvoice.status}, cannot update application_fee_amount`);
          }

          // Also update subscription's application_fee_percent so future cycles inherit the new rate.
          if (draftSub.application_fee_percent !== draftFeePercentage) {
            console.log(`🔄 Updating subscription ${draftSub.id} application_fee_percent from ${draftSub.application_fee_percent}% to ${draftFeePercentage}%`);
            await connectedStripe.subscriptions.update(draftSub.id, {
              application_fee_percent: draftFeePercentage,
              metadata: {
                ...draftSub.metadata,
                fee_updated_at: new Date().toISOString(),
                previous_fee: draftSub.application_fee_percent?.toString() || '0',
              },
            });
          }
        } catch (error) {
          console.error('❌ Error in invoice.created handler:', error);
          // Don't fail the webhook — log and continue
        }

        return NextResponse.json({ received: true });
      }

      case 'invoice.payment_succeeded':
        const invoice = event.data.object as Stripe.Invoice;
        // Ids only: the invoice carries the customer's email, name and address.
        console.log('📄 Invoice payment succeeded:', {
          invoiceId: invoice.id,
          billingReason: (invoice as any).billing_reason,
        });

        // In Clover API, subscription is now in parent.subscription_details.subscription
        // instead of invoice.subscription
        const invoiceParent = (invoice as any).parent;
        const subscriptionId = invoiceParent?.subscription_details?.subscription || invoice.subscription;

        if (!subscriptionId) {
          console.log('⚠️ No subscription associated with invoice');
          return NextResponse.json({ received: true });
        }

        console.log('📄 Found subscription ID:', subscriptionId);

        try {
          // Get subscription from the connected account
          const subscription = await connectedStripe.subscriptions.retrieve(
            subscriptionId as string
          );

          // The subscription.updated event that follows records the
          // broadcast tier; a 400 here made Stripe retry for days.
          if (isBroadcastSubscription(subscription)) {
            return NextResponse.json({ received: true });
          }

          if (!subscription.metadata?.user_id || !subscription.metadata?.community_id) {
            console.error('Missing metadata in subscription:', subscription.id);
            return NextResponse.json({ error: 'Missing metadata' }, { status: 400 });
          }

          if ((await applyPaidMembership(connectedStripe, subscription)) === 'retry') {
            return retryLater();
          }

          console.log('✅ Successfully updated member status');
          return NextResponse.json({ received: true });
        } catch (error) {
          console.error('❌ Error in invoice.payment_succeeded handler:', error);
          return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
        }

      case 'customer.subscription.deleted':
      case 'customer.subscription.updated':
        const subscription = event.data.object as Stripe.Subscription;

        // Broadcast subscriptions are handled separately; short-circuit before the
        // membership-metadata guard below.
        if (await handleBroadcastSubscriptionLifecycle(subscription)) {
          break;
        }

        if (!subscription.metadata?.user_id || !subscription.metadata?.community_id) {
          console.error('Missing metadata in subscription:', subscription.id);
          return NextResponse.json({ error: 'Missing metadata' }, { status: 400 });
        }

        // Determine the effective subscription status
        // If subscription is active but set to cancel at period end, use 'canceling'
        const effectiveStatus = memberSubscriptionStatus(subscription);

        // In Clover API, current_period_end is now on subscription items, not the subscription itself
        // Use type assertion since SDK types may not reflect latest API version
        const subscriptionItem = subscription.items.data[0] as any;
        const subCurrentPeriodEnd = subscriptionItem?.current_period_end;

        // Update member subscription status. Only the row that holds this
        // subscription: after a re-join or a re-applied promo code the member
        // has a new one, and events for the old one must not touch it.
        try {
          await sql`
            UPDATE community_members
            SET
              subscription_status = ${effectiveStatus},
              current_period_end = ${subCurrentPeriodEnd ? new Date(subCurrentPeriodEnd * 1000).toISOString() : null}
            WHERE community_id = ${subscription.metadata.community_id}
              AND user_id = ${subscription.metadata.user_id}
              AND stripe_subscription_id = ${subscription.id}
          `;
        } catch (statusUpdateError) {
          console.error('Error updating subscription status:', statusUpdateError);
          return NextResponse.json(
            { error: 'Failed to update subscription status' },
            { status: 500 }
          );
        }

        // If subscription is canceled or expired, update member status. The
        // members_count column is kept by a trigger on row insert/delete.
        if (subscription.status === 'canceled' || subscription.status === 'unpaid') {
          try {
            await sql`
              UPDATE community_members
              SET
                status = 'inactive',
                cancelled_at = NOW()
              WHERE community_id = ${subscription.metadata.community_id}
                AND user_id = ${subscription.metadata.user_id}
                AND stripe_subscription_id = ${subscription.id}
                AND status <> 'inactive'
            `;
          } catch (memberStatusError) {
            console.error('Error updating member status:', memberStatusError);
            return NextResponse.json(
              { error: 'Failed to update member status' },
              { status: 500 }
            );
          }
        }
        break;

      case 'invoice.payment_failed':
        const failedInvoice = event.data.object as Stripe.Invoice;
        // In Clover API, subscription is now in parent.subscription_details.subscription
        const failedInvoiceParent = (failedInvoice as any).parent;
        const failedSubscriptionId = failedInvoiceParent?.subscription_details?.subscription || failedInvoice.subscription;

        if (failedSubscriptionId) {
          // Use connectedStripe for Connect events (uses event.account), otherwise platform stripe
          const failedSubscription = await connectedStripe.subscriptions.retrieve(
            failedSubscriptionId as string
          );

          if (isBroadcastSubscription(failedSubscription)) {
            break;
          }

          if (!failedSubscription.metadata?.user_id || !failedSubscription.metadata?.community_id) {
            console.error('Missing metadata in subscription:', failedSubscription.id);
            return NextResponse.json({ error: 'Missing metadata' }, { status: 400 });
          }

          // A failed 'subscription_update' invoice is a pending upgrade proration
          // (e.g. an abandoned 3DS on switch-to-yearly). With pending_if_incomplete
          // the base subscription is untouched, so it must NOT be flagged past_due.
          // Only a failed renewal ('subscription_cycle') reflects real trouble — and
          // in every case we write Stripe's actual subscription status rather than
          // assuming past_due, so the DB matches Stripe's source of truth.
          const failedBillingReason = (failedInvoice as any).billing_reason;
          if (failedBillingReason === 'subscription_update') {
            console.log(
              `⏭️ invoice.payment_failed for a subscription_update proration (sub ${failedSubscription.id}); leaving base status ${failedSubscription.status} untouched`
            );
            break;
          }

          // Update member subscription status to reflect Stripe's real status.
          try {
            await sql`
              UPDATE community_members
              SET
                subscription_status = ${memberSubscriptionStatus(failedSubscription)}
              WHERE community_id = ${failedSubscription.metadata.community_id}
                AND user_id = ${failedSubscription.metadata.user_id}
                AND stripe_subscription_id = ${failedSubscription.id}
            `;
          } catch (failureUpdateError) {
            console.error('Error updating subscription status:', failureUpdateError);
            return NextResponse.json(
              { error: 'Failed to update subscription status' },
              { status: 500 }
            );
          }
        }
        break;

      // Note: customer.subscription.updated is already handled above in the combined case

      case 'checkout.session.completed': {
        await handleBroadcastCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}
