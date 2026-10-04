export type OfferingKey = "liveClasses" | "courses" | "privateLessons";
export type Offerings = Record<OfferingKey, boolean>;

export const ALL_OFFERINGS: Offerings = {
  liveClasses: true,
  courses: true,
  privateLessons: true,
};

interface OfferingColumns {
  offers_live_classes?: boolean | null;
  offers_courses?: boolean | null;
  offers_private_lessons?: boolean | null;
}

/** Anything but an explicit false is on (covers rows from before the migration). */
export function getOfferings(c: OfferingColumns): Offerings {
  return {
    liveClasses: c.offers_live_classes !== false,
    courses: c.offers_courses !== false,
    privateLessons: c.offers_private_lessons !== false,
  };
}

export type OfferingAccess = "allow" | "banner" | "redirect";

/**
 * What happens when someone opens a page that belongs to an offering: members
 * are sent to the feed when it's off; owners and site admins still get in, with
 * a banner, so they can see what they turned off.
 */
export function offeringAccess(
  offerings: Offerings,
  key: OfferingKey,
  canManage: boolean
): OfferingAccess {
  if (offerings[key]) return "allow";
  return canManage ? "banner" : "redirect";
}
