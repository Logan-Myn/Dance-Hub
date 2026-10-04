import type { LatePolicy } from "@/lib/private-lessons/policy";

export interface LessonType {
  id: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  regularPrice: number;
  memberPrice: number | null;
  discountPercent: number | null;
  locationType: "online" | "in_person" | "both";
  requirements: string | null;
  maxPerMonth: number | null;
  cutoffHours: number;
  latePolicy: LatePolicy;
  isActive: boolean;
  teacherId: string;
}
