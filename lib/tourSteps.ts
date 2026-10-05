import { Tour } from 'nextstepjs';
import type { Offerings } from './offerings';

const baseTours: Tour[] = [
  {
    tour: 'onboarding',
    steps: [
      {
        icon: '👋',
        title: 'Welcome to your community',
        content: 'Congratulations on creating your dance community! Let me show you around the key features to help you get started.',
        selector: '#community-header',
        side: 'bottom',
        showControls: true,
        showSkip: true,
        pointerPadding: 10,
        pointerRadius: 8,
      },
      {
        icon: '✍️',
        title: 'Share Your Thoughts',
        content: 'This is where you can create posts to share updates, tips, or start discussions with your community members.',
        selector: '#write-post',
        side: 'bottom',
        showControls: true,
        showSkip: true,
        pointerPadding: 10,
        pointerRadius: 8,
      },
      {
        icon: '🏷️',
        title: 'Organize with Categories',
        content: 'Use thread categories to help organize different types of discussions, like technique tips or event announcements. We\'ll show you how to create them in a moment.',
        selector: '#thread-categories',
        side: 'bottom',
        showControls: true,
        showSkip: true,
        pointerPadding: 10,
        pointerRadius: 8,
      },
      {
        icon: '🧭',
        title: 'Find your way around',
        content: 'Use these tabs to move between the community feed, your classroom, private lessons, the calendar and your About page.',
        selector: '#navigation-tab-buttons',
        side: 'bottom',
        showControls: true,
        showSkip: true,
        pointerPadding: 10,
        pointerRadius: 8,
      },
      {
        icon: '🎓',
        title: 'Your classroom',
        content: 'The Classroom tab is where you can share structured learning content, tutorials, and courses for your students.',
        selector: '#tab-classroom',
        side: 'bottom',
        showControls: true,
        showSkip: true,
        pointerPadding: 10,
        pointerRadius: 8,
      },
      {
        icon: '🕺',
        title: 'Private lessons',
        content: 'The Private Lessons tab is where you can offer and manage one-on-one sessions for your community members.',
        selector: '#tab-private-lessons',
        side: 'bottom',
        showControls: true,
        showSkip: true,
        pointerPadding: 10,
        pointerRadius: 8,
      },
      {
        icon: '🛠️',
        title: 'Manage private lessons',
        content: 'Add the times members can book with "Open times", and create lessons with "Add lesson type". Each lesson card lets you edit it or hide it.',
        selector: '#manage-private-lessons',
        side: 'bottom',
        showControls: true,
        showSkip: true,
        pointerPadding: 10,
        pointerRadius: 8,
      },
      {
        icon: '📅',
        title: 'Calendar and live classes',
        content: 'Use the Calendar tab to schedule and run live group classes for your members. Recurring weekly slots and one-off classes both live here.',
        selector: '#tab-calendar',
        side: 'bottom',
        showControls: true,
        showSkip: true,
        pointerPadding: 10,
        pointerRadius: 8,
      },
      {
        icon: 'ℹ️',
        title: 'Your About page',
        content: 'The About page is what visitors see before they join. It fills itself from what you offer, and you can add a welcome video and your story.',
        selector: '#tab-about',
        side: 'bottom',
        showControls: true,
        showSkip: true,
        pointerPadding: 10,
        pointerRadius: 8,
      },
      {
        icon: '⚙️',
        title: 'Manage your community',
        content: 'Click here to open the admin dashboard, where you can configure every part of your community.',
        selector: '#manage-community-button',
        side: 'top',
        showControls: true,
        showSkip: true,
        pointerPadding: 10,
        pointerRadius: 8,
      },
      {
        icon: '🎨',
        title: 'Community details',
        content: 'Change your community name, description and cover image here, and add links to your website or social profiles.',
        selector: '#settings-general',
        side: 'left',
        showControls: true,
        showSkip: true,
        pointerPadding: 10,
        pointerRadius: 8,
      },
      {
        icon: '💳',
        title: 'Pricing and payouts',
        content: 'Choose a free or paid membership, set your prices, and connect the bank account your payouts go to.',
        selector: '#settings-subscriptions',
        side: 'left',
        showControls: true,
        showSkip: true,
        pointerPadding: 10,
        pointerRadius: 8,
      },
      {
        icon: '🏷️',
        title: 'Post topics',
        content: 'Topics organise the feed, like Questions, Practice clips or Events. Members pick one when they post, and they show as filters above the feed.',
        selector: '#settings-thread_categories',
        side: 'left',
        showControls: true,
        showSkip: true,
        pointerPadding: 10,
        pointerRadius: 8,
      },
      {
        icon: '👥',
        title: 'Watch your community grow',
        content: 'Keep an eye on your member count here. Watch it grow as more dancers discover your community!',
        selector: '#member-count',
        side: 'top',
        showControls: true,
        showSkip: true,
        pointerPadding: 10,
        pointerRadius: 8,
      },
    ],
  },
];

// Steps that point at a tab for an offering; the tab isn't there when it's off.
const OFFERING_SELECTORS: Record<keyof Offerings, string[]> = {
  courses: ['#tab-classroom'],
  privateLessons: ['#tab-private-lessons', '#manage-private-lessons'],
  liveClasses: ['#tab-calendar'],
};

const KEYS = ['liveClasses', 'courses', 'privateLessons'] as const;

/** The onboarding tour to start for these offerings ("onboarding" when all are on). */
export function onboardingTourName(o: Offerings): string {
  const mask = KEYS.map((k) => (o[k] ? '1' : '0')).join('');
  return mask === '111' ? 'onboarding' : `onboarding-${mask}`;
}

const onboarding = baseTours.find((t) => t.tour === 'onboarding')!;
const variants: Tour[] = [];
for (let n = 0; n < 7; n++) {
  const o = { liveClasses: !!(n & 4), courses: !!(n & 2), privateLessons: !!(n & 1) };
  const hidden = KEYS.filter((k) => !o[k]).flatMap((k) => OFFERING_SELECTORS[k]);
  variants.push({
    tour: onboardingTourName(o),
    steps: onboarding.steps.filter((s) => !s.selector || !hidden.includes(s.selector)),
  });
}

export const tourSteps: Tour[] = [...baseTours, ...variants];
