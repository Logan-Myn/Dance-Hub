import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogOut, User as UserIcon, Settings } from "lucide-react";
import { signOut } from "@/lib/auth";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

// Better Auth User type
interface User {
  id: string;
  email: string;
  name: string;
  image?: string | null;
}

interface UserAccountNavProps {
  user: User;
  profile: Profile | null;
}

export default function UserAccountNav({ user, profile }: UserAccountNavProps) {
  const router = useRouter();
  
  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success("Successfully signed out");
      router.push('/');
    } catch (error) {
      toast.error("Error signing out");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="focus-visible:outline-none">
        <Avatar className="h-8 w-8">
          <AvatarImage src={profile?.avatar_url || user.image || undefined} />
          <AvatarFallback className="uppercase">
            <span suppressHydrationWarning>
              {profile?.full_name?.[0] || user.email?.[0] || "U"}
            </span>
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <div className="flex items-center justify-start gap-2 p-2">
          <div className="flex flex-col space-y-1 leading-none">
            {(profile?.full_name || user.name) && (
              <p className="font-medium">{profile?.full_name || user.name}</p>
            )}
            {user.email && (
              <p className="w-[200px] truncate text-sm text-muted-foreground">
                {user.email}
              </p>
            )}
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push('/dashboard/settings')}>
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-red-600"
          onClick={handleSignOut}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
