import Link from "next/link";
import { CalendarPlus, Link2, Megaphone } from "lucide-react";
import { communityPath } from "@/lib/safe-redirect";
import { cn } from "@/lib/utils";
import { BTN_SECONDARY, copyInviteLink } from "../feed-header";
import { RailSection } from "./rail-section";

export function OwnerTools({ slug, onAnnounce, showSchedule }: { slug: string; onAnnounce: () => void; showSchedule: boolean }) {
  return (
    <RailSection title="Owner tools">
      <div className="grid gap-2">
        <button type="button" className={cn(BTN_SECONDARY, "justify-start")} onClick={onAnnounce}>
          <Megaphone aria-hidden="true" />
          Post an announcement
        </button>
        {showSchedule && (
          <Link href={communityPath(slug, "/calendar")} className={cn(BTN_SECONDARY, "justify-start")}>
            <CalendarPlus aria-hidden="true" />
            Schedule a class
          </Link>
        )}
        <button type="button" className={cn(BTN_SECONDARY, "justify-start")} onClick={() => copyInviteLink(slug)}>
          <Link2 aria-hidden="true" />
          Copy invite link
        </button>
      </div>
    </RailSection>
  );
}
