"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { LogOut, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InitialsAvatar } from "@/components/ds/initials-avatar";
import { signOut } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { MENU_ITEM, MENU_SEP, POP, POP_TITLE } from "./menu-styles";

export interface AccountMenuProps {
  user: { id: string; email: string; name: string; image?: string | null };
  profile: { full_name: string | null; avatar_url: string | null } | null;
}

/** Avatar button with the viewer's name, settings and sign out. */
export default function AccountMenu({ user, profile }: AccountMenuProps) {
  const router = useRouter();
  const name = profile?.full_name || user.name || user.email;
  const photo = profile?.avatar_url || user.image || null;

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success("Signed out");
      router.push("/");
    } catch {
      toast.error("Couldn't sign you out. Try again.");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Your account"
        className="ml-1 grid h-[38px] w-[38px] place-items-center rounded-full transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand data-[state=open]:bg-surface-2"
      >
        <InitialsAvatar id={user.id} name={name} imageUrl={photo} size={28} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className={cn(POP, "w-60")}>
        <DropdownMenuLabel className={cn(POP_TITLE, "truncate")}>{name}</DropdownMenuLabel>
        <DropdownMenuItem asChild className={MENU_ITEM}>
          <Link href="/dashboard/settings">
            <UserRound aria-hidden="true" />
            Profile and settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator className={MENU_SEP} />
        <DropdownMenuItem className={MENU_ITEM} onSelect={handleSignOut}>
          <LogOut aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
