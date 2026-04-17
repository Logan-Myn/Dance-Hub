"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import UserAccountNav from "@/components/UserAccountNav";
import NotificationsButton from "@/components/NotificationsButton";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';

interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface InitialUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
}

interface NavbarProps {
  /** Server-resolved user — when provided, the SSR'd HTML already shows
   *  the authed nav, so users don't see the avatar/menu pop in. */
  initialUser?: InitialUser | null;
  initialProfile?: Profile | null;
}

export default function Navbar({ initialUser, initialProfile }: NavbarProps = {}) {
  const { user: contextUser, loading: isAuthLoading } = useAuth();
  const { showAuthModal } = useAuthModal();

  // Once the AuthContext finishes hydrating use its value (lets the nav
  // react to sign-in/out without a refresh). Until then fall back to the
  // server-resolved user so first paint already has the right state.
  const user = isAuthLoading ? (initialUser ?? null) : contextUser;

  const { data: profile } = useSWR<Profile>(
    user ? `profile:${user.id}` : null,
    fetcher,
    { fallbackData: initialProfile ?? undefined },
  );

  // Skip the spinner placeholder if the server already told us who the
  // user is — there's no perceptible loading.
  const showLoadingPlaceholder = isAuthLoading && !initialUser && initialUser !== null;

  return (
    <nav className="border-b py-4 px-6">
      <div className="container mx-auto flex justify-between items-center">
        <Link href="/" className="text-xl font-bold">
          DanceHub
        </Link>

        <div className="flex gap-4 items-center">
          {showLoadingPlaceholder ? (
            <div className="w-[200px]" />
          ) : user ? (
            <>
              <Link href="/dashboard">
                <Button variant="ghost">Dashboard</Button>
              </Link>
              <NotificationsButton />
              <UserAccountNav user={user} profile={profile || null} />
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={() => showAuthModal("signin")}
              >
                Sign In
              </Button>
              <Button onClick={() => showAuthModal("signup")}>
                Sign Up
              </Button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
