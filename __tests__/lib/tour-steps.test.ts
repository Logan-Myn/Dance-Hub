import { onboardingTourName, tourSteps } from '@/lib/tourSteps';

const selectors = (name: string) => tourSteps.find((t) => t.tour === name)!.steps.map((s) => s.selector);

describe('onboarding tour per offerings', () => {
  it('uses the full tour when everything is on', () => {
    expect(onboardingTourName({ liveClasses: true, courses: true, privateLessons: true })).toBe('onboarding');
    expect(selectors('onboarding')).toContain('#tab-calendar');
  });

  it('skips the tabs a community switched off', () => {
    const name = onboardingTourName({ liveClasses: false, courses: true, privateLessons: false });
    const steps = selectors(name);
    expect(steps).toContain('#tab-classroom');
    expect(steps).not.toContain('#tab-calendar');
    expect(steps).not.toContain('#tab-private-lessons');
    expect(steps).not.toContain('#manage-private-lessons');
    expect(steps).toContain('#settings-general');
  });

  it('has a tour for every combination', () => {
    for (let n = 0; n < 8; n++) {
      const name = onboardingTourName({ liveClasses: !!(n & 4), courses: !!(n & 2), privateLessons: !!(n & 1) });
      expect(tourSteps.some((t) => t.tour === name)).toBe(true);
    }
  });
});
