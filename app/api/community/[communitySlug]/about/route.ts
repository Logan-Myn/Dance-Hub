import { NextResponse } from "next/server";
import { sql, queryOne } from "@/lib/db";

// Disable caching for this route
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface AboutPage {
  about_page: {
    sections?: unknown[];
    meta?: {
      last_updated?: string;
      published_version?: string;
    };
  } | null;
}

export async function PUT(request: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const params = await props.params;
  try {
    const { communitySlug } = params;
    const { aboutPage } = await request.json();

    // Update the community
    const aboutPageData = {
      ...aboutPage,
      meta: {
        last_updated: new Date().toISOString(),
        published_version: new Date().toISOString(),
      },
    };

    const result = await sql`
      UPDATE communities
      SET
        about_page = ${JSON.stringify(aboutPageData)}::jsonb,
        updated_at = NOW()
      WHERE slug = ${communitySlug}
      RETURNING id
    `;

    if (result.length === 0) {
      return NextResponse.json(
        { error: "Community not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: "About page updated successfully",
      data: aboutPage,
    });
  } catch (error) {
    console.error("Error updating about page:", error);
    return NextResponse.json(
      { error: "Failed to update about page" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const params = await props.params;
  try {
    const { communitySlug } = params;

    // Get the community
    const community = await queryOne<AboutPage>`
      SELECT about_page
      FROM communities
      WHERE slug = ${communitySlug}
    `;

    if (!community) {
      return NextResponse.json(
        { error: "Community not found" },
        { status: 404 }
      );
    }

    // Return the about page data if it exists
    return NextResponse.json(
      {
        aboutPage: community.about_page || {
          sections: [],
          meta: {
            last_updated: new Date().toISOString(),
          },
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (error) {
    console.error("Error fetching about page:", error);
    return NextResponse.json(
      { error: "Failed to fetch about page" },
      { status: 500 }
    );
  }
}
