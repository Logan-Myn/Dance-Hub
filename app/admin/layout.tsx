import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth-session';
import { getUserIsAdmin } from '@/lib/community-data';
import { loginPath } from '@/lib/safe-redirect';
import AdminLayoutClient from './AdminLayoutClient';

// Gate /admin/* on the server side using auth.api.getSession() directly,
// rather than middleware doing an HTTP fetch back to /api/auth/get-session.
// The self-fetch was failing in production with ERR_SSL_PACKET_LENGTH_TOO_LONG
// and bringing down the whole admin panel with a 500. The admin flag is the
// profile's, the same one the admin API routes check.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect(loginPath('/admin'));
  }
  if (!(await getUserIsAdmin(session.user.id))) {
    redirect('/');
  }

  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
