import { Video, Building, Globe, MapPin } from "lucide-react";
import type { ReactNode } from "react";
import type { PrivateLesson, LessonBooking } from "@/types/private-lessons";

type LocationType = PrivateLesson["location_type"];

export function getLocationIcon(locationType: LocationType): ReactNode {
  switch (locationType) {
    case "online":
      return <Video className="w-4 h-4" />;
    case "in_person":
      return <Building className="w-4 h-4" />;
    case "both":
      return <Globe className="w-4 h-4" />;
    default:
      return <MapPin className="w-4 h-4" />;
  }
}

export function getLocationText(locationType: LocationType): string {
  switch (locationType) {
    case "online":
      return "Online";
    case "in_person":
      return "In Person";
    case "both":
      return "Online or In Person";
    default:
      return "Location TBD";
  }
}

export const PAYMENT_STATUS_BADGE: Record<LessonBooking["payment_status"], string> = {
  succeeded: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  failed: "bg-destructive/10 text-destructive",
  canceled: "bg-destructive/10 text-destructive",
};

export const LESSON_STATUS_BADGE: Record<LessonBooking["lesson_status"], string> = {
  booked: "bg-blue-100 text-blue-800",
  scheduled: "bg-green-100 text-green-800",
  completed: "bg-gray-100 text-gray-800",
  canceled: "bg-red-100 text-red-800",
};

export const LESSON_STATUS_LABEL: Record<LessonBooking["lesson_status"], string> = {
  booked: "Booked",
  scheduled: "Scheduled",
  completed: "Completed",
  canceled: "Canceled",
};
