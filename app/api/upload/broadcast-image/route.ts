import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getSession } from '@/lib/auth-session';
import { queryOne } from '@/lib/db';
import { uploadFile } from '@/lib/storage';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const communitySlug = formData.get('communitySlug') as string | null;
  if (!file || !communitySlug) {
    return NextResponse.json({ error: 'Missing file or communitySlug' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 });
  }

  const community = await queryOne<{ id: string; created_by: string }>`
    SELECT id, created_by FROM communities WHERE slug = ${communitySlug}
  `;
  if (!community || community.created_by !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const ext = file.name.split('.').pop() || 'bin';
  const key = `email-assets/${community.id}/${uuid()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const url = await uploadFile(buffer, key, file.type);
  return NextResponse.json({ url });
}
