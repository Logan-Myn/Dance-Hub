import { auth } from "@/lib/auth-server";
import { NextResponse } from "next/server";

/**
 * Complete password reset with token via Better Auth
 */
export async function POST(request: Request) {
  try {
    const { token, password } = await request.json();

    if (!token || !password) {
      return NextResponse.json(
        { error: "Token and new password are required" },
        { status: 400 }
      );
    }

    // Use Better Auth's server-side API to reset password
    const result = await auth.api.resetPassword({
      body: {
        token,
        newPassword: password,
      },
    });

    if (!result) {
      return NextResponse.json(
        { error: "Failed to reset password" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "Password updated successfully"
    });

  } catch (error) {
    console.error("Error in verify-reset-password:", error);

    if (error instanceof Error) {
      // Handle token expired or invalid errors
      // The auth server says "Invalid token" for links that expired or were used.
      if (/expired|invalid token/i.test(error.message)) {
        return NextResponse.json(
          { error: "Reset link has expired or is invalid. Please request a new one." },
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
