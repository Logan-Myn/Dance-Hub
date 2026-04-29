"use client";

import { Section } from "@/types/page-builder";
import { Button } from "@/components/ui/button";
import { GripVertical, Trash, Settings } from "lucide-react";
import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useJoinCommunity, type JoinCommunityData } from "@/hooks/useJoinCommunity";
import {
  SECTION_COLOR_PALETTE,
  getJoinButtonLabel,
  normalizeExternalUrl,
} from "@/lib/page-builder";

interface CTASectionProps {
  section: Section;
  onUpdate: (content: Section['content']) => void;
  onDelete: () => void;
  isEditing?: boolean;
  communityData?: JoinCommunityData;
}

export default function CTASection({
  section,
  onUpdate,
  onDelete,
  isEditing = false,
  communityData
}: CTASectionProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { join, isJoining, modals } = useJoinCommunity(communityData);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleContentEdit = (
    e: React.FormEvent<HTMLDivElement>,
    field: 'title' | 'subtitle'
  ) => {
    const content = e.currentTarget.textContent || '';
    onUpdate({
      ...section.content,
      [field]: content,
    });
  };

  const handleButtonClick = () => {
    if (section.content.buttonType === 'join') {
      join();
    }
  };

  const showColoredBg = section.content.backgroundMode !== 'none';
  const buttonType = section.content.buttonType || 'link';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative group cta-section",
        isDragging ? "opacity-50" : "opacity-100"
      )}
      onMouseEnter={() => {
        if (!isSettingsOpen) setIsHovered(true);
      }}
      onMouseLeave={() => {
        if (!isSettingsOpen) setIsHovered(false);
      }}
    >
      {isEditing && (isHovered || isSettingsOpen) && (
        <div className="absolute top-6 right-6 p-2 flex items-center gap-1 bg-white/95 backdrop-blur-sm rounded-xl border border-border/50 shadow-lg z-20">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </Button>
          <Popover
            open={isSettingsOpen}
            onOpenChange={(open) => {
              setIsSettingsOpen(open);
              if (open) setIsHovered(false);
            }}
          >
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-80 rounded-xl border-border/50"
              onInteractOutside={(e) => {
                const target = e.target as HTMLElement;
                if (!target.closest('.cta-section')) setIsSettingsOpen(false);
                if (target.closest('[role="listbox"]')) e.preventDefault();
              }}
            >
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Color Mode</label>
                  <Select
                    value={section.content.backgroundMode || 'background'}
                    onValueChange={(value: 'background' | 'overlay' | 'none') => {
                      onUpdate({ ...section.content, backgroundMode: value });
                    }}
                  >
                    <SelectTrigger className="rounded-xl border-border/50">
                      <SelectValue placeholder="Select mode" />
                    </SelectTrigger>
                    <SelectContent position="popper" className="rounded-xl">
                      <SelectItem value="background" className="rounded-lg">Background (solid color)</SelectItem>
                      <SelectItem value="overlay" className="rounded-lg">Overlay (gradient effect)</SelectItem>
                      <SelectItem value="none" className="rounded-lg">None (transparent)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {showColoredBg && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Color</label>
                    <div className="flex flex-wrap gap-2">
                      {SECTION_COLOR_PALETTE.map((option) => (
                        <button
                          key={option.color}
                          onClick={() => onUpdate({
                            ...section.content,
                            overlayColor: option.color,
                          })}
                          className={cn(
                            "w-8 h-8 rounded-lg transition-all",
                            option.bg,
                            section.content.overlayColor === option.color
                              ? "ring-2 ring-primary ring-offset-2"
                              : "hover:scale-110"
                          )}
                          title={option.label}
                        />
                      ))}
                    </div>
                    <input
                      type="color"
                      value={section.content.overlayColor || '#7c3aed'}
                      onChange={(e) => onUpdate({
                        ...section.content,
                        overlayColor: e.target.value,
                      })}
                      className="w-full h-8 rounded-lg cursor-pointer border border-border/50"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Button Type</label>
                  <Select
                    value={buttonType}
                    onValueChange={(value: 'link' | 'join') => {
                      onUpdate({
                        ...section.content,
                        buttonType: value,
                        ...(value === 'link' && !section.content.ctaText && { ctaText: 'Click here' }),
                        ...(value === 'link' && !section.content.ctaLink && { ctaLink: '' })
                      });
                    }}
                  >
                    <SelectTrigger className="rounded-xl border-border/50">
                      <SelectValue placeholder="Select button type" />
                    </SelectTrigger>
                    <SelectContent position="popper" className="rounded-xl">
                      <SelectItem value="link" className="rounded-lg">Regular Link</SelectItem>
                      <SelectItem value="join" className="rounded-lg">Join Community</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {buttonType === 'link' && (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Button Text</label>
                      <Input
                        value={section.content.ctaText || ''}
                        onChange={(e) => onUpdate({ ...section.content, ctaText: e.target.value })}
                        placeholder="Enter button text"
                        className="rounded-xl border-border/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Button Link</label>
                      <Input
                        value={section.content.ctaLink || ''}
                        onChange={(e) => onUpdate({ ...section.content, ctaLink: e.target.value })}
                        placeholder="Enter button link"
                        className="rounded-xl border-border/50"
                      />
                    </div>
                  </>
                )}
              </div>
            </PopoverContent>
          </Popover>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 rounded-lg text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
            onClick={onDelete}
          >
            <Trash className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div
        className={cn(
          "relative py-20 md:py-28 px-6 overflow-hidden rounded-3xl mx-4 my-4",
          !showColoredBg && "bg-muted"
        )}
        style={showColoredBg ? {
          background: section.content.backgroundMode === 'overlay'
            ? `linear-gradient(135deg, ${section.content.overlayColor || '#7c3aed'}, ${section.content.overlayColor || '#7c3aed'}dd)`
            : section.content.overlayColor || '#7c3aed'
        } : undefined}
      >
        {showColoredBg && (
          <>
            <div className="absolute top-10 left-10 w-32 h-32 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute bottom-10 right-10 w-48 h-48 rounded-full bg-white/10 blur-3xl" />
          </>
        )}

        <div className={cn(
          "relative z-10 max-w-3xl mx-auto text-center",
          showColoredBg ? "text-white" : "text-foreground"
        )}>
          <h2
            className={cn(
              "font-display text-3xl md:text-4xl lg:text-5xl font-semibold mb-4 outline-none",
              showColoredBg && "drop-shadow-lg"
            )}
            contentEditable={isEditing}
            onBlur={(e) => handleContentEdit(e, 'title')}
            suppressContentEditableWarning
          >
            {section.content.title || 'Add title'}
          </h2>
          <p
            className={cn(
              "text-lg md:text-xl mb-10 outline-none max-w-xl mx-auto",
              showColoredBg ? "opacity-90 drop-shadow-md" : "text-muted-foreground"
            )}
            contentEditable={isEditing}
            onBlur={(e) => handleContentEdit(e, 'subtitle')}
            suppressContentEditableWarning
          >
            {section.content.subtitle || 'Add subtitle'}
          </p>
          {(buttonType === 'join' || buttonType === 'link') && (
            <Button
              size="lg"
              className={cn(
                "font-semibold rounded-xl h-14 px-8 text-lg",
                "transition-all duration-300 ease-out",
                "hover:scale-105 hover:shadow-xl shadow-lg",
                showColoredBg
                  ? "bg-white text-primary hover:bg-white/90"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
              onClick={buttonType === 'join' ? handleButtonClick : undefined}
              asChild={buttonType === 'link'}
              disabled={
                buttonType === 'join' && (communityData?.isMember || isJoining)
              }
            >
              {buttonType === 'link' ? (
                <a
                  href={normalizeExternalUrl(section.content.ctaLink)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {section.content.ctaText || 'Click here'}
                </a>
              ) : (
                <span>{getJoinButtonLabel(communityData, { isEditing })}</span>
              )}
            </Button>
          )}
        </div>
      </div>

      {modals}
    </div>
  );
}
