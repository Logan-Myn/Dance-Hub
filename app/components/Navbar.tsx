"use client";

import Link from "next/link";
import { BTN_GHOST, BTN_PRIMARY } from "@/components/community-feed/feed-header";
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
    <nav className="border-b border-line bg-surface">
      <div className="mx-auto flex h-[60px] max-w-[1240px] items-center justify-between gap-3 px-4 sm:px-8">
        <Link href="/" aria-label="Dance-Hub home" className="flex items-center gap-2.5 font-display text-[17px] font-semibold text-ink">
          <span aria-hidden="true" className="grid h-[30px] w-[30px] place-items-center rounded-lg bg-brand text-[13px] font-bold tracking-tight text-white">
            DH
          </span>
          Dance-Hub
        </Link>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {showLoadingPlaceholder ? (
            <div className="w-[200px]" />
          ) : user ? (
            <>
              <Link href="/dashboard" className={BTN_GHOST}>
                Dashboard
              </Link>
              <NotificationsButton />
              <UserAccountNav user={user} profile={profile || null} />
            </>
          ) : (
            <>
              <button type="button" className={BTN_GHOST} onClick={() => showAuthModal("signin")}>
                Sign in
              </button>
              <button type="button" className={BTN_PRIMARY} onClick={() => showAuthModal("signup")}>
                Sign up
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
