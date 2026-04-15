import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { stripe } from '@/lib/stripe';
import { query, queryOne, sql } from '@/lib/db';
import { videoRoomService } from '@/lib/video-room-service';
import { getEmailService } from '@/lib/resend/email-service';
import { BookingConfirmationEmail } from '@/lib/resend/templates/booking/booking-confirmation';
import { PaymentReceiptEmail } from '@/lib/resend/templates/booking/payment-receipt';
import { MemberWelcomeEmail } from '@/lib/resend/templates/community/member-welcome';
import { CommunityOpeningEmail } from '@/lib/resend/templates/community/community-opening';
import {
  upsertBroadcastSubscription,
  markBroadcastSubscriptionStatus,
} from '@/lib/broadcasts/billing';
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
  daily_room_url: string | null;
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
  await upsertBroadcastSubscription({
    communityId,
    stripeCustomerId: sub.customer as string,
    stripeSubscriptionId: sub.id,
    status: sub.status as 'active' | 'past_due' | 'canceled' | 'incomplete',
    currentPeriodEnd: (sub as any).current_period_end
      ? new Date((sub as any).current_period_end * 1000)
      : null,
  });
}

async function handleBroadcastSubscriptionLifecycle(sub: Stripe.Subscription): Promise<boolean> {
  if (sub.metadata?.purpose !== 'broadcast_subscription') return false;
  await markBroadcastSubscriptionStatus(
    sub.id,
    sub.status as 'active' | 'past_due' | 'canceled' | 'incomplete',
    (sub as any).current_period_end ? new Date((sub as any).current_period_end * 1000) : null
  );
  return true;
}

export async function POST(request: Request) {
  try {
    console.log('🎯🎯🎯 WEBHOOK ENDPOINT HIT - TIMESTAMP:', new Date().toISOString());
    const body = await request.text();
    const signature = headers().get('stripe-signature')!;
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

    console.log('Received webhook event:', event.type);

    // For Connect account events, create a new Stripe instance with the account
    const connectedStripe = event.account ?
      new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: '2025-12-15.clover' as Stripe.LatestApiVersion,
        stripeAccount: event.account
      }) :
      stripe;

    const { stripe_account_id } = (event.data.object as any).metadata || {};

    switch (event.type) {
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

            // Create the booking record
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
                daily_room_name,
                daily_room_url,
                daily_room_expires_at,
                teacher_daily_token,
                student_daily_token,
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
                ${JSON.stringify(contactInfo)}::jsonb,
                NULL,
                NULL,
                NULL,
                NULL,
                NULL,
                NULL,
                NULL
              )
              RETURNING id
            `;

            if (!newBooking) {
              console.error('❌ Error creating booking record: no row returned');
              return NextResponse.json({
                error: 'Failed to create booking record',
                payment_intent_id: paymentIntent.id
              }, { status: 500 });
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

            // Create video room after successful booking creation
            let videoRoomUrl: string | undefined;
            try {
              console.log('🎬 Creating video room for booking:', newBooking.id);
              const result = await videoRoomService.createRoomForBooking(newBooking.id);
              if (result.success) {
                console.log('✅ Video room created successfully for booking:', newBooking.id);
                // Get the updated booking with video room URL
                const updatedBooking = await queryOne<LessonBooking>`
                  SELECT daily_room_url
                  FROM lesson_bookings
                  WHERE id = ${newBooking.id}
                `;
                videoRoomUrl = updatedBooking?.daily_room_url || undefined;
              } else {
                console.error('❌ Video room creation failed:', result.error);
              }
            } catch (videoError) {
              console.error('❌ Error creating video room (non-critical):', videoError);
              // Don't fail the webhook for video room creation errors
              // The video room can be created later if needed
            }

            // Send booking confirmation email to student
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

              await emailService.sendNotificationEmail(
                metadata.student_email,
                `Booking Confirmed: ${lessonDetails?.title || 'Private Lesson'}`,
                React.createElement(BookingConfirmationEmail, {
                  studentName: metadata.student_name || 'Student',
                  teacherName: teacherName,
                  lessonTitle: lessonDetails?.title || 'Private Lesson',
                  lessonDate: formattedDate,
                  lessonTime: formattedTime,
                  duration: lessonDetails?.duration || 60,
                  price: parseFloat(metadata.price_paid),
                  videoRoomUrl: videoRoomUrl,
                  bookingId: newBooking.id,
                  paymentMethod: 'Card',
                })
              );
              console.log('✅ Booking confirmation email sent to student');

              // Send payment receipt email
              await emailService.sendNotificationEmail(
                metadata.student_email,
                `Payment Receipt #${paymentIntent.id.slice(-8).toUpperCase()}`,
                React.createElement(PaymentReceiptEmail, {
                  recipientName: metadata.student_name || 'Student',
                  receiptNumber: paymentIntent.id.slice(-8).toUpperCase(),
                  paymentDate: new Date().toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  }),
                  paymentMethod: 'Credit Card',
                  items: [{
                    description: `${lessonDetails?.title || 'Private Lesson'} with ${teacherName}`,
                    quantity: 1,
                    price: parseFloat(metadata.price_paid),
                    total: parseFloat(metadata.price_paid),
                  }],
                  subtotal: parseFloat(metadata.price_paid),
                  total: parseFloat(metadata.price_paid),
                })
              );
              console.log('✅ Payment receipt email sent to student');

              // Notify teacher about new booking
              if (teacherEmail) {
                await emailService.sendNotificationEmail(
                  teacherEmail,
                  `New Booking: ${metadata.student_name || 'Student'} booked your lesson`,
                  React.createElement(BookingConfirmationEmail, {
                    studentName: teacherName,
                    teacherName: metadata.student_name || 'Student',
                    lessonTitle: lessonDetails?.title || 'Private Lesson',
                    lessonDate: formattedDate,
                    lessonTime: formattedTime,
                    duration: lessonDetails?.duration || 60,
                    price: parseFloat(metadata.price_paid),
                    videoRoomUrl: videoRoomUrl,
                    bookingId: newBooking.id,
                    paymentMethod: 'Card',
                  })
                );
                console.log('✅ Booking notification email sent to teacher');
              }
            } catch (emailError) {
              console.error('❌ Error sending booking emails (non-critical):', emailError);
              // Don't fail the webhook for email sending errors
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
            // Update member status to active
            await sql`
              UPDATE community_members
              SET status = 'active'
              WHERE community_id = ${community_id}
                AND user_id = ${user_id}
            `;

            console.log('✅ Successfully updated member status to active');
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
          const draftCommunityAge = Date.now() - new Date(draftCommunity.created_at).getTime();
          const thirtyDaysInMsDraft = 30 * 24 * 60 * 60 * 1000;
          const draftIsStillPromotional = draftCommunityAge < thirtyDaysInMsDraft;

          let draftFeePercentage = 0;
          if (!draftIsStillPromotional) {
            if (draftCommunity.active_member_count <= 50) {
              draftFeePercentage = 8.0;
            } else if (draftCommunity.active_member_count <= 100) {
              draftFeePercentage = 6.0;
            } else {
              draftFeePercentage = 4.0;
            }
          }

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
        console.log('📄 Invoice payment succeeded');
        const invoice = event.data.object as Stripe.Invoice;
        console.log('📄 Full invoice:', JSON.stringify(invoice, null, 2));

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

          if (!subscription.metadata?.user_id || !subscription.metadata?.community_id) {
            console.error('Missing metadata in subscription:', subscription.id);
            return NextResponse.json({ error: 'Missing metadata' }, { status: 400 });
          }

          const { user_id, community_id } = subscription.metadata;
          console.log('🔍 Processing invoice payment for:', { user_id, community_id });

          // Check if this member should transition from promotional to standard pricing
          const community = await queryOne<Community>`
            SELECT id, name, slug, description, image_url, membership_price, created_at, active_member_count, status, opening_date
            FROM communities
            WHERE id = ${community_id}
          `;

          // Get user profile for email
          const userProfile = await queryOne<UserProfile>`
            SELECT full_name, email
            FROM profiles
            WHERE auth_user_id = ${user_id}
          `;

          if (community) {
            const communityAge = Date.now() - new Date(community.created_at).getTime();
            const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
            const isStillPromotional = communityAge < thirtyDaysInMs;

            let newFeePercentage = 0;
            if (!isStillPromotional) {
              // Calculate standard tiered pricing
              if (community.active_member_count <= 50) {
                newFeePercentage = 8.0;
              } else if (community.active_member_count <= 100) {
                newFeePercentage = 6.0;
              } else {
                newFeePercentage = 4.0;
              }

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

            // Update member status and platform fee percentage
            await sql`
              UPDATE community_members
              SET
                status = 'active',
                subscription_status = ${subscription.status},
                platform_fee_percentage = ${isStillPromotional ? 0 : newFeePercentage}
              WHERE community_id = ${community_id}
                AND user_id = ${user_id}
            `;

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

            // Send appropriate welcome email
            if (userProfile?.email && community) {
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
                      communityDescription: community.description || undefined,
                      communityLogo: community.image_url || undefined,
                      communityUrl,
                      membershipTier: 'basic',
                      benefits: defaultBenefits,
                      nextSteps,
                    })
                  );
                  console.log('✅ Member welcome email sent to:', userProfile.email);
                }
              } catch (emailError) {
                console.error('❌ Error sending welcome email (non-critical):', emailError);
                // Don't fail the webhook for email errors
              }
            }

            // Increment member count if member just became active
            try {
              await sql`SELECT increment_members_count(${community_id})`;
              console.log('✅ Incremented member count');
            } catch (countError) {
              console.error('Error incrementing member count:', countError);
            }
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
        let effectiveStatus: string = subscription.status;
        if (subscription.status === 'active' && subscription.cancel_at_period_end) {
          effectiveStatus = 'canceling';
        }

        // In Clover API, current_period_end is now on subscription items, not the subscription itself
        // Use type assertion since SDK types may not reflect latest API version
        const subscriptionItem = subscription.items.data[0] as any;
        const subCurrentPeriodEnd = subscriptionItem?.current_period_end;

        // Update member subscription status
        try {
          await sql`
            UPDATE community_members
            SET
              subscription_status = ${effectiveStatus},
              current_period_end = ${subCurrentPeriodEnd ? new Date(subCurrentPeriodEnd * 1000).toISOString() : null}
            WHERE community_id = ${subscription.metadata.community_id}
              AND user_id = ${subscription.metadata.user_id}
          `;
        } catch (statusUpdateError) {
          console.error('Error updating subscription status:', statusUpdateError);
          return NextResponse.json(
            { error: 'Failed to update subscription status' },
            { status: 500 }
          );
        }

        // If subscription is canceled or expired, update member status and decrement count
        if (subscription.status === 'canceled' || subscription.status === 'unpaid') {
          try {
            await sql`
              UPDATE community_members
              SET
                status = 'inactive'
              WHERE community_id = ${subscription.metadata.community_id}
                AND user_id = ${subscription.metadata.user_id}
            `;
          } catch (memberStatusError) {
            console.error('Error updating member status:', memberStatusError);
            return NextResponse.json(
              { error: 'Failed to update member status' },
              { status: 500 }
            );
          }

          try {
            await sql`SELECT decrement_members_count(${subscription.metadata.community_id})`;
          } catch (countError) {
            console.error('Error updating members count:', countError);
            return NextResponse.json(
              { error: 'Failed to update members count' },
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

          if (!failedSubscription.metadata?.user_id || !failedSubscription.metadata?.community_id) {
            console.error('Missing metadata in subscription:', failedSubscription.id);
            return NextResponse.json({ error: 'Missing metadata' }, { status: 400 });
          }

          // Update member subscription status to reflect payment failure
          try {
            await sql`
              UPDATE community_members
              SET
                subscription_status = 'past_due'
              WHERE community_id = ${failedSubscription.metadata.community_id}
                AND user_id = ${failedSubscription.metadata.user_id}
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
