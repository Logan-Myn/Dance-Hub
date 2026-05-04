"use client";

import { Section } from "@/types/page-builder";
import { Button } from "@/components/ui/button";
import { GripVertical, Trash, Settings, Upload } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import toast from "react-hot-toast";
import { MuxPlayer } from "@/components/MuxPlayer";

interface VideoSectionProps {
  section: Section;
  onUpdate: (content: Section['content']) => void;
  onDelete: () => void;
  isEditing?: boolean;
  communityId: string;
}

export default function VideoSection({
  section,
  onUpdate,
  onDelete,
  isEditing = false,
  communityId,
}: VideoSectionProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);
  const { session } = useAuth();

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSectionDragging,
  } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleUpload = async (file: File) => {
    try {
      setIsUploading(true);
      setUploadProgress(0);

      if (!session) {
        throw new Error('Authentication required');
      }

      // Get upload URL
      const response = await fetch('/api/mux/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId }),
      });

      if (!response.ok) {
        throw new Error('Failed to get upload URL');
      }

      const { uploadId, uploadUrl } = await response.json();

      // Create a promise to handle the upload
      const uploadPromise = new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(progress);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Network error during upload'));
        });

        xhr.open('PUT', uploadUrl);
        xhr.send(file);
      });

      // Wait for upload to complete
      await uploadPromise;
      setUploadProgress(100);

      // Start polling for asset readiness
      let attempts = 0;
      const maxAttempts = 60; // 60 seconds timeout
      const pollInterval = 1000; // 1 second

      const pollAsset = async (): Promise<any> => {
        if (cancelledRef.current) {
          throw new Error('Upload cancelled');
        }
        if (attempts >= maxAttempts) {
          throw new Error('Timeout waiting for asset to be ready');
        }

        try {
          const assetResponse = await fetch(`/api/mux/assets/${uploadId}`);

          if (!assetResponse.ok) {
            throw new Error('Failed to check asset status');
          }

          const asset = await assetResponse.json();

          if (asset.status === 'ready') {
            return asset;
          }

          attempts++;
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          return pollAsset();
        } catch (error) {
          console.error('Error polling asset:', error);
          throw error;
        }
      };

      const readyAsset = await pollAsset();
      if (cancelledRef.current) return;
      onUpdate({
        ...section.content,
        videoId: readyAsset.playbackId
      });
      setIsUploading(false);
      toast.success('Video uploaded successfully!');
    } catch (error) {
      console.error('Upload error:', error);
      setIsUploading(false);
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      if (file.size > 500 * 1024 * 1024) { // 500MB limit
        toast.error('File size must be less than 500MB');
        return;
      }
      handleUpload(file);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 500 * 1024 * 1024) { // 500MB limit
        toast.error('File size must be less than 500MB');
        return;
      }
      handleUpload(file);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative group video-section",
        isSectionDragging ? "opacity-50" : "opacity-100"
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
                if (!target.closest('.video-section')) setIsSettingsOpen(false);
              }}
            >
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Video Title</label>
                  <Input
                    value={section.content.title || ''}
                    onChange={(e) => onUpdate({ ...section.content, title: e.target.value })}
                    placeholder="Enter video title"
                    className="rounded-xl border-border/50"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Video Description</label>
                  <Input
                    value={section.content.description || ''}
                    onChange={(e) => onUpdate({ ...section.content, description: e.target.value })}
                    placeholder="Enter video description"
                    className="rounded-xl border-border/50"
                  />
                </div>
                {section.content.videoId && (
                  <div className="pt-2 border-t border-border/50">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        onUpdate({ ...section.content, videoId: undefined });
                        setIsSettingsOpen(false);
                      }}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Replace Video
                    </Button>
                  </div>
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

      {/* Content - Fluid Movement */}
      <div className="py-12 md:py-16">
        <div className="max-w-4xl mx-auto px-4">
          {section.content.videoId ? (
            <div className="rounded-2xl overflow-hidden shadow-lg">
              <MuxPlayer
                playbackId={section.content.videoId}
                maxResolution="1080p"
                metadata={{
                  video_title: section.content.title || "Video",
                  video_description: section.content.description || "",
                }}
              />
            </div>
          ) : isEditing ? (
            <div
              className={cn(
                "aspect-video relative border-2 border-dashed rounded-2xl transition-all duration-300",
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-border/50 hover:border-primary/50 bg-muted/20"
              )}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="video/*"
                onChange={handleFileSelect}
                disabled={isUploading}
              />

              <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4">
                <div className="h-16 w-16 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Upload className="w-8 h-8 text-primary" />
                </div>
                <div className="text-center">
                  <p className="text-lg font-medium text-foreground">
                    Drag and drop your video here, or{" "}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="text-primary hover:text-primary/80 font-semibold transition-colors"
                      disabled={isUploading}
                    >
                      browse
                    </button>
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Maximum file size: 500MB
                  </p>
                </div>
              </div>

              {isUploading && (
                <div className="absolute inset-x-0 bottom-8 px-8 space-y-3">
                  <Progress value={uploadProgress} className="w-full h-2 rounded-full" />
                  <div className="text-sm text-center text-muted-foreground font-medium">
                    {uploadProgress === 100 ? 'Processing video...' : `Uploading... ${uploadProgress}%`}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {(section.content.title || section.content.description) && (
            <div className="mt-6 space-y-2">
              {section.content.title && (
                <h3 className="font-display text-2xl font-semibold text-foreground">{section.content.title}</h3>
              )}
              {section.content.description && (
                <p className="text-muted-foreground">{section.content.description}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 