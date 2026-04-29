"use client";

import { Section } from "@/types/page-builder";
import { Button } from "@/components/ui/button";
import { GripVertical, Trash, Settings, UploadCloud } from "lucide-react";
import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { uploadFileToStorage, STORAGE_FOLDERS } from "@/lib/storage-client";
import Image from "next/image";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import toast from "react-hot-toast";

interface ImageSectionProps {
  section: Section;
  onUpdate: (content: Section['content']) => void;
  onDelete: () => void;
  isEditing?: boolean;
}

export default function ImageSection({ 
  section, 
  onUpdate, 
  onDelete,
  isEditing = false 
}: ImageSectionProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

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

      // Upload to B2 Storage via API
      const imageUrl = await uploadFileToStorage(file, STORAGE_FOLDERS.COMMUNITY_PAGES);

      onUpdate({
        ...section.content,
        imageUrl,
      });

      toast.success('Image uploaded successfully');
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error('Failed to upload image');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative group image-section",
        isDragging ? "opacity-50" : "opacity-100"
      )}
      onMouseEnter={() => {
        if (!isSettingsOpen) {
          setIsHovered(true);
        }
      }}
      onMouseLeave={() => {
        if (!isSettingsOpen) {
          setIsHovered(false);
        }
      }}
    >
      {/* Editor Toolbar - Fluid Movement */}
      {isEditing && (isHovered || isSettingsOpen) && (
        <div className="absolute top-4 right-4 p-2 flex items-center gap-1 bg-card/95 backdrop-blur-sm rounded-xl border border-border/50 shadow-lg z-20">
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
                if (!target.closest('.image-section')) setIsSettingsOpen(false);
                if (target.closest('[role="listbox"]')) e.preventDefault();
              }}
            >
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Image</label>
                  <div className="flex items-center gap-4">
                    {section.content.imageUrl && (
                      <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-border/50">
                        <Image
                          src={section.content.imageUrl}
                          alt="Section image"
                          fill
                          className="object-cover"
                        />
                      </div>
                    )}
                    <label className="cursor-pointer">
                      <div className="flex items-center gap-2 px-4 py-2 border border-border/50 rounded-xl hover:bg-muted transition-colors">
                        <UploadCloud className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{isUploading ? 'Uploading...' : 'Upload Image'}</span>
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageUpload}
                        disabled={isUploading}
                      />
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Caption</label>
                  <Input
                    value={section.content.caption || ''}
                    onChange={(e) => onUpdate({ ...section.content, caption: e.target.value })}
                    placeholder="Add image caption"
                    className="rounded-xl border-border/50"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Layout</label>
                  <Select
                    value={section.content.layout || 'full'}
                    onValueChange={(value: "full" | "contained" | "float-left" | "float-right") => {
                      onUpdate({ ...section.content, layout: value });
                    }}
                  >
                    <SelectTrigger className="rounded-xl border-border/50">
                      <SelectValue placeholder="Select layout" />
                    </SelectTrigger>
                    <SelectContent position="popper" className="rounded-xl">
                      <SelectItem value="full" className="rounded-lg">Full Width</SelectItem>
                      <SelectItem value="contained" className="rounded-lg">Contained</SelectItem>
                      <SelectItem value="float-left" className="rounded-lg">Float Left</SelectItem>
                      <SelectItem value="float-right" className="rounded-lg">Float Right</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Alt Text</label>
                  <Input
                    value={section.content.altText || ''}
                    onChange={(e) => onUpdate({ ...section.content, altText: e.target.value })}
                    placeholder="Describe the image for accessibility"
                    className="rounded-xl border-border/50"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground">Zoom on hover</label>
                  <Switch
                    checked={!section.content.disableHoverZoom}
                    onCheckedChange={(checked) =>
                      onUpdate({ ...section.content, disableHoverZoom: !checked })
                    }
                  />
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

      {/* Content - Fluid Movement */}
      <div className="py-12 md:py-16">
        <div
          className={cn(
            "mx-auto px-4 w-full",
            section.content.layout === 'contained' && "max-w-4xl",
            section.content.layout === 'float-left' && "float-left mr-8 max-w-md",
            section.content.layout === 'float-right' && "float-right ml-8 max-w-md"
          )}
        >
          {section.content.imageUrl ? (
            <figure className="group relative w-full min-h-[300px]">
              <div className={cn(
                "relative w-full h-full min-h-[300px] overflow-hidden rounded-2xl",
                !section.content.disableHoverZoom && "transition-all duration-300 ease-out group-hover:shadow-xl",
                section.content.layout === 'full' && "h-[calc(100vw*9/21)]",
                section.content.layout === 'contained' && "h-[calc(100vw*9/16)] max-h-[500px]",
                (section.content.layout === 'float-left' || section.content.layout === 'float-right') && "h-[300px]"
              )}>
                <Image
                  src={section.content.imageUrl}
                  alt={section.content.altText || ''}
                  fill
                  className={cn(
                    "object-cover",
                    !section.content.disableHoverZoom && "transition-transform duration-500 group-hover:scale-105"
                  )}
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
              </div>
              {section.content.caption && (
                <figcaption className="text-sm text-muted-foreground mt-4 text-center font-medium">
                  {section.content.caption}
                </figcaption>
              )}
            </figure>
          ) : (
            isEditing && (
              <div className="h-[300px] border-2 border-dashed border-border/50 rounded-2xl flex items-center justify-center bg-muted/20 hover:border-primary/50 transition-colors">
                <label className="cursor-pointer">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-16 w-16 rounded-xl bg-primary/10 flex items-center justify-center">
                      <UploadCloud className="h-8 w-8 text-primary" />
                    </div>
                    <span className="text-sm text-muted-foreground font-medium">Upload an image</span>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                    disabled={isUploading}
                  />
                </label>
              </div>
            )
          )}
        </div>
        {(section.content.layout === 'float-left' || section.content.layout === 'float-right') && (
          <div className="clear-both" />
        )}
      </div>
    </div>
  );
} 