"use client";

import { Section } from "@/types/page-builder";
import { Button } from "../ui/button";
import Image from "next/image";
import { UploadCloud, GripVertical, Trash, Settings, X } from "lucide-react";
import { useState, useRef } from "react";
import { uploadFileToStorage, STORAGE_FOLDERS } from "@/lib/storage-client";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "../ui/input";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
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

interface HeroSectionProps {
  section: Section;
  onUpdate: (content: Section['content']) => void;
  onDelete: () => void;
  isEditing?: boolean;
  communityData?: JoinCommunityData;
}

export default function HeroSection({
  section,
  onUpdate,
  onDelete,
  isEditing = false,
  communityData
}: HeroSectionProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      const publicUrl = await uploadFileToStorage(file, STORAGE_FOLDERS.COMMUNITY_PAGES);
      onUpdate({ ...section.content, imageUrl: publicUrl });
      toast.success('Image uploaded successfully');
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error('Failed to upload image');
    } finally {
      setIsUploading(false);
      if (e.target) e.target.value = '';
    }
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

  const showColoredOverlay = section.content.backgroundMode !== 'none';
  const showImage =
    section.content.imageUrl && section.content.backgroundMode !== 'background';
  const showOverlayGradient =
    section.content.backgroundMode === 'overlay' ||
    section.content.backgroundMode === undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative group hero-section-banner",
        isDragging ? "opacity-50" : "opacity-100"
      )}
      onMouseEnter={() => {
        if (!isSettingsOpen) setIsHovered(true);
      }}
      onMouseLeave={() => {
        if (!isSettingsOpen) setIsHovered(false);
      }}
    >
      <div
        className={cn(
          "relative h-[500px] md:h-[600px] flex items-center justify-center overflow-hidden rounded-3xl mx-4 my-4",
          section.content.backgroundMode === 'none' ? "bg-muted text-foreground" : "text-white"
        )}
        style={section.content.backgroundMode === 'background' ? {
          backgroundColor: section.content.overlayColor || '#7c3aed'
        } : undefined}
      >
        {showImage && (
          <Image
            src={section.content.imageUrl!}
            alt={section.content.title || ''}
            fill
            className="object-cover"
            priority
          />
        )}

        {showOverlayGradient && (
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(to top, ${section.content.overlayColor || '#7c3aed'}ee, ${section.content.overlayColor || '#7c3aed'}66, transparent)`
            }}
          />
        )}

        <div className={cn(
          "relative z-10 text-center max-w-3xl mx-auto px-6",
          section.content.backgroundMode === 'none' && "text-foreground"
        )}>
          <h1
            className={cn(
              "font-display text-4xl md:text-5xl lg:text-6xl font-semibold mb-6 outline-none",
              showColoredOverlay && "drop-shadow-lg"
            )}
            contentEditable={isEditing}
            onBlur={(e) => handleContentEdit(e, 'title')}
            suppressContentEditableWarning
          >
            {section.content.title || 'Add title'}
          </h1>
          <p
            className={cn(
              "text-lg md:text-xl lg:text-2xl mb-10 outline-none max-w-2xl mx-auto",
              showColoredOverlay ? "opacity-90 drop-shadow-md" : "text-muted-foreground"
            )}
            contentEditable={isEditing}
            onBlur={(e) => handleContentEdit(e, 'subtitle')}
            suppressContentEditableWarning
          >
            {section.content.subtitle || 'Add subtitle'}
          </p>
          {(section.content.buttonType === 'join' || section.content.buttonType === 'link') && (
            <Button
              size="lg"
              className={cn(
                "font-semibold rounded-xl h-14 px-8 text-lg",
                "transition-all duration-300 ease-out",
                "hover:scale-105 hover:shadow-xl shadow-lg",
                section.content.backgroundMode === 'none'
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-white text-primary hover:bg-white/90"
              )}
              onClick={section.content.buttonType === 'join' ? handleButtonClick : undefined}
              asChild={section.content.buttonType === 'link'}
              disabled={
                section.content.buttonType === 'join' &&
                (communityData?.isMember || isJoining)
              }
            >
              {section.content.buttonType === 'link' ? (
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

        {showColoredOverlay && (
          <svg
            viewBox="0 0 1200 60"
            className="absolute bottom-0 left-0 w-full h-8 md:h-12"
            preserveAspectRatio="none"
            fill="hsl(var(--background))"
          >
            <path d="M0,60 L0,30 Q600,0 1200,30 L1200,60 Z" />
          </svg>
        )}
      </div>

      {isEditing && (isHovered || isSettingsOpen) && (
        <div className="absolute top-6 right-6 p-2 flex items-center gap-1 bg-card/95 backdrop-blur-sm rounded-xl border border-border/50 shadow-lg z-20">
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
                if (!target.closest('.hero-section-banner')) {
                  setIsSettingsOpen(false);
                }
                if (target.closest('[role="listbox"]')) {
                  e.preventDefault();
                }
              }}
            >
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Background Image</label>
                  <div className="flex items-center gap-4">
                    {section.content.imageUrl && (
                      <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-border/50 group">
                        <Image
                          src={section.content.imageUrl}
                          alt="Background"
                          fill
                          className="object-cover"
                        />
                        <button
                          onClick={() => onUpdate({ ...section.content, imageUrl: undefined })}
                          className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        >
                          <X className="h-5 w-5 text-white" />
                        </button>
                      </div>
                    )}
                    <div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageUpload}
                        disabled={isUploading}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="h-[100px] w-full border-2 border-dashed border-border/50 rounded-xl flex items-center justify-center hover:border-primary/50 transition-colors"
                      >
                        <div className="flex flex-col items-center gap-2">
                          <UploadCloud className="h-8 w-8 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">
                            {isUploading ? 'Uploading...' : 'Upload Image'}
                          </span>
                        </div>
                      </button>
                      <p className="text-xs text-muted-foreground mt-2">
                        Max size: 5MB. Supported: JPG, PNG, GIF
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Color Mode</label>
                    <Select
                      value={section.content.backgroundMode || 'overlay'}
                      onValueChange={(value: 'background' | 'overlay' | 'none') => {
                        onUpdate({ ...section.content, backgroundMode: value });
                      }}
                    >
                      <SelectTrigger className="rounded-xl border-border/50">
                        <SelectValue placeholder="Select mode" />
                      </SelectTrigger>
                      <SelectContent position="popper" className="rounded-xl">
                        <SelectItem value="overlay" className="rounded-lg">Overlay (gradient on image)</SelectItem>
                        <SelectItem value="background" className="rounded-lg">Background (solid color)</SelectItem>
                        <SelectItem value="none" className="rounded-lg">None (transparent)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {showColoredOverlay && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Color</label>
                      <div className="flex flex-wrap gap-2">
                        {SECTION_COLOR_PALETTE.map((option) => (
                          <button
                            key={option.color}
                            onClick={() => onUpdate({ ...section.content, overlayColor: option.color })}
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
                        onChange={(e) => onUpdate({ ...section.content, overlayColor: e.target.value })}
                        className="w-full h-8 rounded-lg cursor-pointer border border-border/50"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Button Type</label>
                    <Select
                      value={section.content.buttonType || 'link'}
                      onValueChange={(value: 'link' | 'join') => {
                        onUpdate({
                          ...section.content,
                          buttonType: value,
                          ctaText: value === 'link' ? (section.content.ctaText || 'Click here') : section.content.ctaText
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

                  {section.content.buttonType === 'link' && (
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

      {modals}
    </div>
  );
}
