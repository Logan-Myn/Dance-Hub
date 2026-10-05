export interface DiscoveryCommunity {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  image_url: string | null;
  image_focal_x: number | null;
  image_focal_y: number | null;
  image_zoom: string | number | null;
  status: string;
  opening_date: string | null;
  members_count: number;
  isMember: boolean;
  isOwner: boolean;
}

/** Lower case without accents, so "Salsa" finds "salsa" and "yilla" finds "Yillá". */
function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * The communities whose name or description holds every word of the search,
 * in the order given. An empty search keeps them all.
 */
export function searchCommunities<T extends Pick<DiscoveryCommunity, "name" | "description">>(
  communities: T[],
  search: string
): T[] {
  const words = fold(search).split(/\s+/).filter(Boolean);
  if (words.length === 0) return communities;
  return communities.filter((c) => {
    const haystack = fold(`${c.name} ${c.description ?? ""}`);
    return words.every((w) => haystack.includes(w));
  });
}
