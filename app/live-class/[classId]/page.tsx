import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import LiveClassVideoPage from "@/components/LiveClassVideoPage";

interface LiveClassPageProps {
  params: Promise<{
    classId: string;
  }>;
}

interface LiveClass {
  id: string;
  title: string;
  description?: string;
  scheduled_start_time: string;
  duration_minutes: number;
  daily_room_name?: string;
  status: 'scheduled' | 'live' | 'ended' | 'cancelled';
  community_slug: string;
  community_name: string;
  teacher_name: string;
  teacher_avatar_url?: string;
  is_currently_active: boolean;
  is_starting_soon: boolean;
}

export default async function LiveClassPage(props: LiveClassPageProps) {
  const params = await props.params;
  const { classId } = params;

  // Fetch live class details from the view
  const liveClasses = await sql`
    SELECT id, title, description, scheduled_start_time, duration_minutes,
           daily_room_name, status, community_slug, community_name,
           teacher_name, teacher_avatar_url, is_currently_active, is_starting_soon
    FROM live_classes_with_details
    WHERE id = ${classId}
  ` as LiveClass[];

  const liveClass = liveClasses[0];

  if (!liveClass) {
    redirect("/");
  }

  return (
    <LiveClassVideoPage
      classId={classId}
      liveClass={liveClass}
    />
  );
}
