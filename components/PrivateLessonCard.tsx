"use client";

import { PrivateLesson } from "@/types/private-lessons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, MapPin, Users, Percent, Video, Building, Globe, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface PrivateLessonCardProps {
  lesson: PrivateLesson;
  communitySlug: string;
  isMember: boolean;
  onBook: (lessonId: string) => void;
}

export default function PrivateLessonCard({
  lesson,
  communitySlug,
  isMember,
  onBook,
}: PrivateLessonCardProps) {
  const displayPrice = isMember && lesson.member_price ? lesson.member_price : lesson.regular_price;
  const hasDiscount = isMember && lesson.member_price && lesson.member_price < lesson.regular_price;

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-EU', {
      style: 'currency',
      currency: 'EUR',
    }).format(price);
  };

  const getLocationIcon = () => {
    switch (lesson.location_type) {
      case 'online':
        return <Video className="w-4 h-4" />;
      case 'in_person':
        return <Building className="w-4 h-4" />;
      case 'both':
        return <Globe className="w-4 h-4" />;
      default:
        return <MapPin className="w-4 h-4" />;
    }
  };

  const getLocationText = () => {
    switch (lesson.location_type) {
      case 'online':
        return 'Online';
      case 'in_person':
        return 'In Person';
      case 'both':
        return 'Online or In Person';
      default:
        return 'Location TBD';
    }
  };

  return (
    <div
      className={cn(
        "group bg-card rounded-2xl overflow-hidden",
        "border-2 border-transparent",
        "transition-all duration-300 ease-out",
        "hover:shadow-lg hover:border-primary/20",
        "hover:-translate-y-0.5 hover:rotate-[-0.3deg]",
        "flex flex-col"
      )}
    >
      {/* Header */}
      <div className="p-5 pb-0">
        <div className="flex justify-between items-start gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-xl font-semibold text-foreground group-hover:text-primary transition-colors duration-200 line-clamp-2">
              {lesson.title}
            </h3>
            {lesson.description && (
              <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                {lesson.description}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5 items-end flex-shrink-0">
            {!lesson.is_active && (
              <Badge className="bg-slate-200 text-slate-700 border-0 rounded-full px-2.5 py-1">
                <EyeOff className="w-3 h-3 mr-1" />
                Hidden
              </Badge>
            )}
            {hasDiscount && (
              <Badge className="bg-emerald-100 text-emerald-700 border-0 rounded-full px-2.5 py-1">
                <Percent className="w-3 h-3 mr-1" />
                {lesson.member_discount_percentage}% off
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-5 space-y-4 flex-1">
        {/* Duration and Location */}
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5 bg-muted px-3 py-1.5 rounded-full">
            <Clock className="w-3.5 h-3.5" />
            <span>{lesson.duration_minutes} min</span>
          </div>
          <div className="flex items-center gap-1.5 bg-muted px-3 py-1.5 rounded-full">
            {getLocationIcon()}
            <span>{getLocationText()}</span>
          </div>
        </div>

        {/* Requirements */}
        {lesson.requirements && (
          <div className="text-sm bg-muted/50 rounded-xl p-3">
            <span className="font-medium text-foreground">Requirements: </span>
            <span className="text-muted-foreground">{lesson.requirements}</span>
          </div>
        )}

        {/* Max bookings info */}
        {lesson.max_bookings_per_month && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Users className="w-4 h-4" />
            <span>Max {lesson.max_bookings_per_month} bookings per month</span>
          </div>
        )}
      </div>

      {/* Pricing & Button */}
      <div className="p-5 pt-0 mt-auto">
        <div className="pt-4 border-t border-border/50">
          <div className="flex items-end justify-between mb-4">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-display text-2xl font-bold text-foreground">
                  {formatPrice(displayPrice)}
                </span>
                {hasDiscount && (
                  <span className="text-base text-muted-foreground line-through">
                    {formatPrice(lesson.regular_price)}
                  </span>
                )}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                {isMember ? (
                  hasDiscount ? (
                    <span className="text-emerald-600 font-medium">
                      ✓ Member price
                    </span>
                  ) : (
                    <span>Member price</span>
                  )
                ) : (
                  <div>
                    <span>Non-member price</span>
                    {lesson.member_price && (
                      <div className="text-primary font-medium">
                        Members pay {formatPrice(lesson.member_price)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {lesson.is_active ? (
            <Button
              onClick={() => onBook(lesson.id)}
              className="w-full rounded-xl bg-primary hover:bg-primary/90 transition-all duration-200 h-12 font-semibold"
              size="lg"
            >
              Book Lesson
            </Button>
          ) : (
            <Button
              disabled
              variant="outline"
              className="w-full rounded-xl h-12 font-medium text-muted-foreground"
              size="lg"
            >
              Not available — activate in Manage Lessons
            </Button>
          )}
        </div>
      </div>
    </div>
  );
} 