"use client";

import React from 'react';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { cn, formatPrice } from '@/lib/utils';
import type { PrivateLesson } from '@/types/private-lessons';

interface LessonCardProps {
  lesson: PrivateLesson;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}

const LOCATION_LABEL: Record<PrivateLesson['location_type'], string> = {
  online: 'Online',
  in_person: 'In person',
  both: 'Online or in person',
};

export function LessonCard({
  lesson,
  onEdit,
  onToggleActive,
  onDelete,
}: LessonCardProps) {
  return (
    <div className="relative rounded-2xl border border-border/60 bg-card hover:border-border transition-colors">
      <button
        type="button"
        onClick={onEdit}
        aria-label="Edit lesson"
        className="w-full text-left p-4 pr-12"
      >
        <div className="flex items-start justify-between gap-2 mb-3">
          <h3 className="font-display text-base font-semibold leading-snug">
            {lesson.title}
          </h3>
          <Badge
            variant={lesson.is_active ? 'default' : 'secondary'}
            className={cn(
              'shrink-0 font-normal text-xs',
              lesson.is_active
                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                : '',
            )}
          >
            {lesson.is_active ? 'Active' : 'Inactive'}
          </Badge>
        </div>
        <div className="text-2xl font-display font-bold text-foreground">
          {formatPrice(lesson.regular_price)}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {lesson.duration_minutes} min · {LOCATION_LABEL[lesson.location_type]}
        </div>
      </button>

      <div className="absolute top-3 right-3">
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="More actions"
            className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center"
          >
            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
            <DropdownMenuItem onClick={onToggleActive}>
              {lesson.is_active ? 'Deactivate' : 'Activate'}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
