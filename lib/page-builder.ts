export const SECTION_COLOR_PALETTE = [
  { color: '#000000', label: 'Black', bg: 'bg-black' },
  { color: '#7c3aed', label: 'Purple', bg: 'bg-violet-600' },
  { color: '#2563eb', label: 'Blue', bg: 'bg-blue-600' },
  { color: '#059669', label: 'Green', bg: 'bg-emerald-600' },
  { color: '#dc2626', label: 'Red', bg: 'bg-red-600' },
  { color: '#d97706', label: 'Orange', bg: 'bg-amber-600' },
  { color: '#0891b2', label: 'Cyan', bg: 'bg-cyan-600' },
  { color: '#ec4899', label: 'Pink', bg: 'bg-pink-500' },
] as const;

interface JoinButtonLabelData {
  isMember?: boolean;
  status?: 'active' | 'pre_registration' | 'inactive';
  membershipEnabled?: boolean;
  membershipPrice?: number;
}

export function getJoinButtonLabel(
  data: JoinButtonLabelData | undefined,
  { isEditing }: { isEditing?: boolean } = {}
): string {
  if (data?.isMember && !isEditing) return "You're already a member";
  if (data?.status === 'inactive') return 'Community Inactive';

  const price = data?.membershipPrice;
  const isPaid = Boolean(data?.membershipEnabled && price && price > 0);

  if (data?.status === 'pre_registration') {
    return isPaid ? `Pre-Register for €${price}/month` : 'Pre-Register for free';
  }
  return isPaid ? `Join for €${price}/month` : 'Join for free';
}

export function normalizeExternalUrl(url: string | undefined): string {
  if (!url) return '#';
  return url.startsWith('http') ? url : `https://${url}`;
}
