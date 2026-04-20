import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Outfit, Figtree } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { AuthModalProvider } from "@/contexts/AuthModalContext";
import { Toaster } from "react-hot-toast";
import { Analytics } from "@vercel/analytics/next";
import { NextStepProvider } from "nextstepjs";
import NextStepWrapper from "@/components/NextStepWrapper";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DanceHub - Dance Community Platform",
  description: "Join dance communities, learn from teachers, and connect with other dancers.",
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="overscroll-none">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${outfit.variable} ${figtree.variable} antialiased`}
      >
        <NextStepProvider>
          <NextStepWrapper>
            <AuthProvider>
              <AuthModalProvider>
                {children}
              </AuthModalProvider>
              <Toaster position="bottom-right" />
            </AuthProvider>
          </NextStepWrapper>
        </NextStepProvider>
        <Analytics />
      </body>
    </html>
  );
}
