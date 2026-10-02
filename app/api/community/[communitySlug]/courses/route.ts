import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { uniqueCourseSlug, isUniqueViolation } from "@/lib/course-slug";
import { uploadFile, generateFileKey, deleteFile } from "@/lib/storage";
import { requireCommunityManager } from "@/lib/community-auth";

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

export async function POST(request: Request, props: { params: Promise<{ communitySlug: string }> }) {
  const params = await props.params;
  try {
    // Only the owner (or a platform admin) may create courses and upload
    // their cover images.
    const guard = await requireCommunityManager(params.communitySlug);
    if (!guard.ok) return guard.response;
    const { community } = guard;

    // Parse the form data
    const formData = await request.formData();
    const title = formData.get("title") as string;
    if (!title || !title.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    const description = formData.get("description") as string;
    const imageFile = formData.get("image") as File | null;
    const isPublic = formData.get("is_public") === "true";

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

    // Create a new course, with a slug no other course in the community
    // uses. If a concurrent create takes the same slug first, the unique
    // index refuses this insert and we pick the next one.
    let newCourse: Course | null = null;
    for (let attempt = 1; ; attempt++) {
      const slug = await uniqueCourseSlug(community.id, title);
      try {
        newCourse = await queryOne<Course>`
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
        break;
      } catch (insertError) {
        if (!isUniqueViolation(insertError) || attempt >= 3) throw insertError;
      }
    }

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
