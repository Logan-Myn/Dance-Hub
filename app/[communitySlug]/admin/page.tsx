import { redirect } from 'next/navigation';

export default function AdminIndex({ params }: { params: { communitySlug: string } }) {
  redirect(`/${params.communitySlug}/admin/emails`);
}
