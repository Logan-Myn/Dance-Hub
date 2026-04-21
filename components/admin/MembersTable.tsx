"use client";

import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Users } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export interface MemberRow {
  id: string;
  displayName: string;
  email: string;
  imageUrl: string;
  joinedAt: string;
  status: "active" | "inactive" | string;
  // The community_members_with_profiles view does not include a last_active
  // column; the old API route surfaced it as undefined and the modal always
  // rendered "N/A". We preserve that behaviour here.
  lastActive?: string | null;
}

interface MembersTableProps {
  communitySlug: string;
  members: MemberRow[];
}

export function MembersTable({ communitySlug, members }: MembersTableProps) {
  const router = useRouter();

  async function handleRemoveMember(memberId: string) {
    if (!confirm("Are you sure you want to remove this member?")) return;
    try {
      const response = await fetch(`/api/community/${communitySlug}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to remove member");
      }
      toast.success("Member removed successfully");
      router.refresh();
    } catch (err) {
      console.error("Error removing member:", err);
      toast.error("Failed to remove member");
    }
  }

  if (members.length === 0) {
    return (
      <div className="bg-card rounded-2xl p-12 border border-border/50 text-center">
        <Users className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
        <p className="text-muted-foreground">No members yet</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-border/50 overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr className="border-b border-border/50 bg-muted/30">
            <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Member
            </th>
            <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Email
            </th>
            <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Joined
            </th>
            <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Status
            </th>
            <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Last Active
            </th>
            <th className="px-6 py-4 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {members.map((member) => (
            <tr
              key={member.id}
              className="hover:bg-muted/30 transition-colors duration-150"
            >
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center">
                  <Avatar className="h-10 w-10 ring-2 ring-primary/20">
                    <AvatarImage
                      src={member.imageUrl}
                      alt={member.displayName}
                    />
                    <AvatarFallback className="bg-primary/10 text-primary font-medium">
                      {member.displayName[0]?.toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="ml-4">
                    <div className="text-sm font-medium text-foreground">
                      {member.displayName}
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-muted-foreground">
                  {member.email}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-muted-foreground">
                  {new Date(member.joinedAt).toLocaleDateString()}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span
                  className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    member.status === "active"
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {member.status}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                {member.lastActive
                  ? new Date(member.lastActive).toLocaleDateString()
                  : "N/A"}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRemoveMember(member.id)}
                  className="rounded-lg border-destructive/30 text-destructive hover:bg-destructive/10 hover:border-destructive/50 transition-all"
                >
                  Remove
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
