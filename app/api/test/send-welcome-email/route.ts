import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { getEmailService } from '@/lib/resend/email-service';
import { MemberWelcomeEmail } from '@/lib/resend/templates/community/member-welcome';
import { CommunityOpeningEmail } from '@/lib/resend/templates/community/community-opening';
import React from 'react';

// TEST ENDPOINT - Remove in production or protect with auth
// Usage: POST /api/test/send-welcome-email
// Body: { "email": "test@example.com", "communitySlug": "bachataflow", "type": "welcome" | "opening" }

interface Community {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  membership_price: number | null;
}

export async function POST(request: Request) {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  try {
    const { email, communitySlug, type = 'welcome', memberName = 'Test User' } = await request.json();

    if (!email || !communitySlug) {
      return NextResponse.json(
        { error: 'Missing required fields: email, communitySlug' },
        { status: 400 }
      );
    }

    // Get community details
    const community = await queryOne<Community>`
      SELECT id, name, slug, description, image_url, membership_price
      FROM communities
      WHERE slug = ${communitySlug}
    `;

    if (!community) {
      return NextResponse.json({ error: 'Community not found' }, { status: 404 });
    }

    const emailService = getEmailService();
    const communityUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/${community.slug}`;

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

    if (type === 'opening') {
      await emailService.sendNotificationEmail(
        email,
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
      console.log('✅ Test community opening email sent to:', email);
    } else {
      await emailService.sendNotificationEmail(
        email,
        `Welcome to ${community.name}!`,
        React.createElement(MemberWelcomeEmail, {
          memberName,
          communityName: community.name,
          communityLogo: community.image_url || undefined,
          communityUrl,
        })
      );
      console.log('✅ Test member welcome email sent to:', email);
    }

    return NextResponse.json({
      success: true,
      message: `${type === 'opening' ? 'Community opening' : 'Member welcome'} email sent to ${email}`,
    });
  } catch (error) {
    console.error('Error sending test email:', error);
    return NextResponse.json(
      { error: 'Failed to send test email', details: (error as Error).message },
      { status: 500 }
    );
  }
}
