import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function DELETE(request: Request, props: { params: Promise<{ threadId: string }> }) {
  const params = await props.params;
  try {
    const { threadId } = params;

    // Delete the thread (comments will be deleted automatically due to CASCADE)
    await sql`
      DELETE FROM threads
      WHERE id = ${threadId}
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting thread:", error);
    return NextResponse.json(
      { error: "Failed to delete thread" },
      { status: 500 }
    );
  }
}
