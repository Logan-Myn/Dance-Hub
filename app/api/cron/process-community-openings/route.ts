import { NextRequest, NextResponse } from 'next/server';
import { query, sql } from '@/lib/db';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-12-15.clover' as Stripe.LatestApiVersion,
});

interface Community {
  id: string;
  name: string;
  stripe_account_id: string | null;
  [key: string]: unknown;
}

interface Member {
  id: string;
  user_id: string;
  stripe_subscription_id: string | null;
}

// Prevent caching
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Security: Verify CRON_SECRET
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const now = new Date().toISOString();

    // Find all communities in pre_registration status with opening_date <= now
    const communities = await query<Community>`
      SELECT *
      FROM communities
      WHERE status = 'pre_registration'
        AND opening_date <= ${now}
    `;

    if (!communities || communities.length === 0) {
      return NextResponse.json({
        message: 'No communities ready to open',
        processed: 0
      });
    }

    const results = [];

    for (const community of communities) {
      try {
        // Get all pre-registered members for this community
        const members = await query<Member>`
          SELECT *
          FROM community_members
          WHERE community_id = ${community.id}
            AND status = 'pre_registered'
        `;

        let successCount = 0;
        let failCount = 0;
        const memberResults = [];

        // Process each pre-registered member
        for (const member of members || []) {
          try {
            // With billing_cycle_anchor set to opening date, Stripe automatically:
            // 1. Creates the first invoice on the opening date
            // 2. Charges the saved payment method
            // 3. Sends invoice.payment_succeeded webhook which updates member status

            // Verify the subscription exists and is ready
            if (member.stripe_subscription_id && community.stripe_account_id) {
              const subscription = await stripe.subscriptions.retrieve(
                member.stripe_subscription_id,
                {
                  stripeAccount: community.stripe_account_id,
                }
              );

              // Check subscription status
              // 'active' means billing has started, 'trialing' means billing hasn't started yet
              // 'incomplete' means payment is pending
              if (['active', 'trialing', 'incomplete'].includes(subscription.status)) {
                memberResults.push({
                  userId: member.user_id,
                  success: true,
                  message: `Subscription status: ${subscription.status}`
                });
                successCount++;
              } else {
                console.error(`Subscription ${subscription.id} has unexpected status: ${subscription.status}`);
                memberResults.push({
                  userId: member.user_id,
                  success: false,
                  error: `Subscription status: ${subscription.status}`
                });
                failCount++;
              }
            } else {
              // No subscription found - this shouldn't happen
              console.error(`No subscription found for member ${member.user_id}`);

              // Update member to inactive
              await sql`
                UPDATE community_members
                SET status = 'inactive',
                    cancelled_at = NOW()
                WHERE id = ${member.id}
              `;

              memberResults.push({
                userId: member.user_id,
                success: false,
                error: 'No subscription found'
              });
              failCount++;
            }
          } catch (memberError) {
            console.error(`Error processing member ${member.user_id}:`, memberError);
            memberResults.push({
              userId: member.user_id,
              success: false,
              error: memberError instanceof Error ? memberError.message : 'Unknown error'
            });
            failCount++;
          }
        }

        // Update community status to active
        await sql`
          UPDATE communities
          SET status = 'active'
          WHERE id = ${community.id}
        `;

        results.push({
          communityId: community.id,
          communityName: community.name,
          success: true,
          membersProcessed: members?.length || 0,
          successCount,
          failCount,
          memberResults
        });

      } catch (communityError) {
        console.error(`Error processing community ${community.id}:`, communityError);
        results.push({
          communityId: community.id,
          communityName: community.name,
          success: false,
          error: communityError instanceof Error ? communityError.message : 'Unknown error'
        });
      }
    }

    return NextResponse.json({
      message: 'Community openings processed',
      processed: communities.length,
      results
    });

  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
