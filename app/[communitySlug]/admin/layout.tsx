import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth-session';
import { queryOne } from '@/lib/db';
import { AdminNav } from '@/components/admin/AdminNav';

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { communitySlug: string };
}) {
  const session = await getSession();
  if (!session) redirect('/auth/login');

  const community = await queryOne<{ id: string; created_by: string; name: string; is_broadcast_vip: boolean }>`
    SELECT id, created_by, name, is_broadcast_vip FROM communities WHERE slug = ${params.communitySlug}
  `;
  if (!community) redirect(`/${params.communitySlug}`);
  if (community.created_by !== session.user.id) redirect(`/${params.communitySlug}`);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <h1 className="text-2xl font-bold mb-6">Admin · {community.name}</h1>
      <div className="flex flex-col sm:flex-row gap-6">
        <AdminNav communitySlug={params.communitySlug} />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
