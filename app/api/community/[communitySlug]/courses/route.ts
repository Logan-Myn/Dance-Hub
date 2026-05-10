import { NextResponse } from "next/server";
import { query, queryOne, sql } from "@/lib/db";
import { slugify } from "@/lib/utils";
import { uploadFile, generateFileKey, deleteFile } from "@/lib/storage";

interface Course {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  slug: string;
  community_id: string;
  created_at: string;
  updated_at: string;
  is_public: boolean;
}

interface CommunityId {
  id: string;
}

export async function GET(request: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const params = await props.params;
  try {
    const { communitySlug } = params;

    // Get community ID first
    const community = await queryOne<CommunityId>`
      SELECT id FROM communities WHERE slug = ${communitySlug}
    `;

    if (!community) {
      return NextResponse.json(
        { error: "Community not found" },
        { status: 404 }
      );
    }

    // Get courses for this community
    const courses = await query<Course>`
      SELECT *
      FROM courses
      WHERE community_id = ${community.id}
      ORDER BY created_at DESC
    `;

    return NextResponse.json(courses);
  } catch (error) {
    console.error("Error fetching courses:", error);
    return NextResponse.json(
      { error: "Failed to fetch courses" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const params = await props.params;
  try {
    const { communitySlug } = params;

    // Get the community
    const community = await queryOne<CommunityId>`
      SELECT id FROM communities WHERE slug = ${communitySlug}
    `;

    if (!community) {
      return NextResponse.json(
        { error: "Community not found" },
        { status: 404 }
      );
    }

    // Parse the form data
    const formData = await request.formData();
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const imageFile = formData.get("image") as File | null;
    const isPublic = formData.get("is_public") === "true";

    // Generate the slug from the title
    const slug = slugify(title);

    // Set default image URL to placeholder
    let imageUrl = `${process.env.NEXT_PUBLIC_APP_URL}/images/course-placeholder.svg`;
    let fileKey = '';

    // Only upload image if one was provided
    if (imageFile && imageFile instanceof File) {
      try {
        // Convert File to Buffer
        const arrayBuffer = await imageFile.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Generate unique file key
        fileKey = generateFileKey('course-images', imageFile.name);

        // Upload to B2 Storage
        imageUrl = await uploadFile(buffer, fileKey, imageFile.type);
      } catch (uploadError) {
        console.error("Error uploading image:", uploadError);
        return NextResponse.json(
          { error: "Failed to upload image" },
          { status: 500 }
        );
      }
    }

    // Create a new course
    const newCourse = await queryOne<Course>`
      INSERT INTO courses (
        title,
        description,
        image_url,
        slug,
        community_id,
        created_at,
        updated_at,
        is_public
      ) VALUES (
        ${title},
        ${description},
        ${imageUrl},
        ${slug},
        ${community.id},
        NOW(),
        NOW(),
        ${isPublic}
      )
      RETURNING *
    `;

    if (!newCourse) {
      console.error("Error creating course");
      // Clean up the uploaded image if course creation fails
      if (fileKey) {
        try {
          await deleteFile(fileKey);
        } catch (deleteError) {
          console.error("Error cleaning up uploaded file:", deleteError);
        }
      }
      return NextResponse.json(
        { error: "Failed to create course" },
        { status: 500 }
      );
    }

    return NextResponse.json(newCourse);
  } catch (error) {
    console.error("Error creating course:", error);
    return NextResponse.json(
      { error: "Failed to create course" },
      { status: 500 }
    );
  }
}
