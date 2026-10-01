import { auth } from "@/lib/auth-server";
import { NextResponse } from "next/server";

/**
 * Verify email change token via Better Auth
 * This endpoint is called when user clicks the verification link in their email
 */
export async function POST(request: Request) {
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json(
        { error: "Token is required" },
        { status: 400 }
      );
    }

    // Use Better Auth's server-side API to verify the email change
    const result = await auth.api.verifyEmail({
      query: {
        token,
      },
    });

    if (!result || !result.status) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 400 }
      );
    }

    // Better Auth's verifyEmail updates the email in the user table; the
    // user.update hook in lib/auth-server.ts copies it to profiles.email.

    return NextResponse.json({
      message: "Email updated successfully"
    });

  } catch (error) {
    console.error("Error in verify-email-change:", error);

    if (error instanceof Error) {
      if (error.message.includes("expired") || error.message.includes("invalid")) {
        return NextResponse.json(
          { error: "Token has expired or is invalid" },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
