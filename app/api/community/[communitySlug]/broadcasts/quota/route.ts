import { NextResponse } from 'next/server';
import { authorizeBroadcastAccess } from '@/lib/broadcasts/auth';
import { getQuota } from '@/lib/broadcasts/quota';

export async function GET(_req: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const params = await props.params;
  const authz = await authorizeBroadcastAccess(params.communitySlug);
  if (!authz.ok) return authz.response;

  const quota = await getQuota(authz.community.id);
  return NextResponse.json(quota);
}
