import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getSession } from "@/lib/auth-session";

interface CommunityCreator {
  created_by: string;
}

export async function GET(request: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const params = await props.params;
  try {
    // Verify the session and get user using Better Auth
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ isCreator: false });
    }

    // Check if user is the community creator
    const community = await queryOne<CommunityCreator>`
      SELECT created_by
      FROM communities
      WHERE slug = ${params.communitySlug}
    `;

    if (!community) {
      return NextResponse.json({ isCreator: false });
    }

    const isCreator = community.created_by === session.user.id;

    return NextResponse.json({ isCreator });
  } catch (error) {
    console.error("Error checking if user is creator:", error);
    return NextResponse.json({ isCreator: false });
  }
}
