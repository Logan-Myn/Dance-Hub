"use client";

import { useState } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Section, SectionType } from "@/types/page-builder";
import { Button } from "./ui/button";
import { Plus, Sparkles, Layout, Video, Type, Image, Megaphone, Save, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { v4 as uuidv4 } from 'uuid';
import dynamic from "next/dynamic";
// Section components are dynamically imported so each only ships its
// own JS chunk to pages where it actually appears in the saved data.
// VideoSection in particular previously leaked ~284 KB gzip (Mux + HLS)
// to every visitor of every community's about page regardless of whether
// the community had a video section. See:
//   docs/superpowers/specs/2026-04-07-bundle-hotspots-findings.md
const HeroSection = dynamic(() => import("./sections/HeroSection"));
const TextSection = dynamic(() => import("./sections/TextSection"));
const ImageSection = dynamic(() => import("./sections/ImageSection"));
const CTASection = dynamic(() => import("./sections/CTASection"));
const VideoSection = dynamic(() => import("./sections/VideoSection"), { ssr: false });
import { Card } from "./ui/card";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "./ui/alert-dialog";

const AVAILABLE_SECTIONS: { type: SectionType; label: string; icon: typeof Layout; description: string }[] = [
  { type: "hero", label: "Hero Section", icon: Layout, description: "Full-width banner with image" },
  { type: "text", label: "Text Content", icon: Type, description: "Rich text with formatting" },
  { type: "image", label: "Image Section", icon: Image, description: "Standalone image display" },
  { type: "cta", label: "Call to Action", icon: Megaphone, description: "Button to drive action" },
  { type: "video", label: "Video Section", icon: Video, description: "Embed video content" },
];

interface PageBuilderProps {
  initialSections: Section[];
  onChange: (sections: Section[]) => void;
  onSave: () => Promise<void>;
  isEditing: boolean;
  isSaving?: boolean;
  communityData?: {
    id: string;
    slug: string;
    name: string;
    membershipEnabled?: boolean;
    membershipPrice?: number;
    stripeAccountId?: string | null;
    isMember?: boolean;
    status?: 'active' | 'pre_registration' | 'inactive';
    opening_date?: string | null;
  };
}

export default function PageBuilder({ 
  initialSections = [], 
  onChange,
  onSave,
  isEditing = true,
  isSaving = false,
  communityData
}: PageBuilderProps) {
  const [sections, setSections] = useState<Section[]>(initialSections);
  const [selectedSectionType, setSelectedSectionType] = useState<SectionType | ''>('');
  const [showClearDialog, setShowClearDialog] = useState(false);

  // Template definitions
  const TEMPLATES = [
    {
      key: 'classic',
      name: 'Classic Introduction',
      description: 'A welcoming hero, your story, a team photo, and a call to action.',
      sections: [
        {
          type: 'hero',
          content: {
            title: 'Welcome to Our Community!',
            subtitle: 'Join us and be part of something special.',
            buttonType: 'join' as const,
          },
        },
        {
          type: 'text',
          content: {
            title: 'About Us',
            text: 'We are passionate about dance and building a vibrant community. Our story began...'
          },
        },
        {
          type: 'image',
          content: {
            imageUrl: '',
            caption: 'Our team or studio',
            altText: 'Team or studio photo',
          },
        },
        {
          type: 'cta',
          content: {
            title: 'Ready to Join?',
            ctaText: 'Become a member',
            ctaLink: '',
            buttonType: 'join' as const,
          },
        },
      ],
    },
    {
      key: 'media',
      name: 'Media Welcome',
      description: 'A big intro, welcome video, short about, and a call to action.',
      sections: [
        {
          type: 'hero',
          content: {
            title: 'Welcome to Our Dance Community!',
            subtitle: 'Watch our story and join the movement.',
            buttonType: 'join' as const,
          },
        },
        {
          type: 'video',
          content: {
            title: 'Welcome Video',
            videoId: '',
            description: 'A quick look at what we do.'
          },
        },
        {
          type: 'text',
          content: {
            title: 'Who We Are',
            text: 'We bring dancers together to learn, share, and grow.'
          },
        },
        {
          type: 'cta',
          content: {
            title: 'Join Us',
            ctaText: 'Become a member',
            ctaLink: '',
            buttonType: 'join' as const,
          },
        },
      ],
    },
  ];

  // Template selection handler
  const handleTemplateSelect = (templateKey: string) => {
    const template = TEMPLATES.find(t => t.key === templateKey);
    if (!template) return;
    const newSections = template.sections.map((section, idx) => ({
      id: uuidv4(),
      type: section.type as SectionType,
      content: section.content,
      order: idx,
    }));
    setSections(newSections);
    onChange(newSections);
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor)
  );

  const handleAddSection = () => {
    if (!selectedSectionType) return;

    const newSection: Section = {
      id: uuidv4(),
      type: selectedSectionType,
      content: {
        title: 'Add a title',
        subtitle: 'Add a subtitle',
        ...(selectedSectionType === 'hero' && {
          buttonType: 'join'
        })
      },
      order: sections.length,
    };

    const updatedSections = [...sections, newSection];
    setSections(updatedSections);
    onChange(updatedSections);
    setSelectedSectionType('');
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      setSections((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        const newOrder = arrayMove(items, oldIndex, newIndex).map(
          (item, index) => ({ ...item, order: index })
        );

        onChange(newOrder);
        return newOrder;
      });
    }
  };

  const handleUpdateSection = (sectionId: string, content: Section['content']) => {
    const updatedSections = sections.map((section) =>
      section.id === sectionId ? { ...section, content } : section
    );
    
    setSections(updatedSections);
    onChange(updatedSections);
  };

  const handleDeleteSection = (sectionId: string) => {
    const updatedSections = sections
      .filter((section) => section.id !== sectionId)
      .map((section, index) => ({ ...section, order: index }));
    
    setSections(updatedSections);
    onChange(updatedSections);
  };

  return (
    <div className="space-y-8">
      {/* Template selection UI - Fluid Movement Design */}
      {isEditing && sections.length === 0 && (
        <div className="mb-10">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full mb-4">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">Quick Start</span>
            </div>
            <h2 className="font-display text-2xl md:text-3xl font-semibold text-foreground mb-2">
              Choose a template to get started
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Select a pre-designed layout or build from scratch
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {TEMPLATES.map((template) => (
              <Card
                key={template.key}
                className={cn(
                  "group p-6 bg-card rounded-2xl border-2 border-border/50",
                  "transition-all duration-300 ease-out cursor-pointer",
                  "hover:shadow-lg hover:border-primary/30",
                  "hover:-translate-y-0.5 hover:rotate-[-0.3deg]"
                )}
                onClick={() => handleTemplateSelect(template.key)}
              >
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300">
                    <Layout className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-display text-lg font-semibold text-foreground mb-1 group-hover:text-primary transition-colors">
                      {template.name}
                    </h3>
                    <p className="text-muted-foreground text-sm mb-4">
                      {template.description}
                    </p>
                    <Button
                      className={cn(
                        "bg-primary hover:bg-primary/90 text-primary-foreground",
                        "rounded-xl h-10 px-5 font-medium",
                        "transition-all duration-200"
                      )}
                    >
                      Use Template
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
          <div className="mt-8 flex items-center gap-4 justify-center">
            <div className="h-px flex-1 max-w-[100px] bg-border/50" />
            <span className="text-sm text-muted-foreground">or build from scratch</span>
            <div className="h-px flex-1 max-w-[100px] bg-border/50" />
          </div>
        </div>
      )}

      {/* Editor Toolbar - Fluid Movement Design */}
      {isEditing && (
        <div className="bg-card rounded-2xl border border-border/50 p-4 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
            <div className="flex items-center gap-3 flex-wrap">
              <Select
                value={selectedSectionType}
                onValueChange={(value) => setSelectedSectionType(value as SectionType)}
              >
                <SelectTrigger className="w-[220px] rounded-xl border-border/50 bg-background h-11">
                  <SelectValue placeholder="Choose section type" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {AVAILABLE_SECTIONS.map((section) => {
                    const Icon = section.icon;
                    return (
                      <SelectItem key={section.type} value={section.type} className="rounded-lg">
                        <div className="flex items-center gap-3">
                          <Icon className="h-4 w-4 text-primary" />
                          <div>
                            <div className="font-medium">{section.label}</div>
                            <div className="text-xs text-muted-foreground">{section.description}</div>
                          </div>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <Button
                onClick={handleAddSection}
                disabled={!selectedSectionType}
                className={cn(
                  "bg-primary hover:bg-primary/90 text-primary-foreground",
                  "rounded-xl h-11 px-5 font-medium",
                  "transition-all duration-200",
                  "disabled:opacity-50"
                )}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Section
              </Button>
            </div>
            {sections.length > 0 && (
              <div className="flex items-center gap-2">
                <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      onClick={() => setShowClearDialog(true)}
                      className="rounded-xl h-11 border-border/50 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Start Fresh
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="rounded-2xl">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="font-display text-xl">Clear all sections?</AlertDialogTitle>
                      <AlertDialogDescription className="text-muted-foreground">
                        This will remove all sections from your about page. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="rounded-xl bg-destructive hover:bg-destructive/90"
                        onClick={() => {
                          setSections([]);
                          onChange([]);
                          setShowClearDialog(false);
                        }}
                      >
                        Yes, clear all
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button
                  onClick={onSave}
                  disabled={isSaving}
                  className={cn(
                    "bg-primary hover:bg-primary/90 text-primary-foreground",
                    "rounded-xl h-11 px-5 font-medium",
                    "transition-all duration-200"
                  )}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sections.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-6">
            {sections.map((section) => (
              <div key={section.id}>
                {section.type === "hero" && (
                  <HeroSection
                    section={section}
                    onUpdate={(content) => handleUpdateSection(section.id, content)}
                    onDelete={() => handleDeleteSection(section.id)}
                    isEditing={isEditing}
                    communityData={communityData}
                  />
                )}
                {section.type === "text" && (
                  <TextSection
                    section={section}
                    onUpdate={(content) => handleUpdateSection(section.id, content)}
                    onDelete={() => handleDeleteSection(section.id)}
                    isEditing={isEditing}
                  />
                )}
                {section.type === "image" && (
                  <ImageSection
                    section={section}
                    onUpdate={(content) => handleUpdateSection(section.id, content)}
                    onDelete={() => handleDeleteSection(section.id)}
                    isEditing={isEditing}
                  />
                )}
                {section.type === "cta" && (
                  <CTASection
                    section={section}
                    onUpdate={(content) => handleUpdateSection(section.id, content)}
                    onDelete={() => handleDeleteSection(section.id)}
                    isEditing={isEditing}
                    communityData={communityData}
                  />
                )}
                {section.type === "video" && (
                  <VideoSection
                    section={section}
                    onUpdate={(content) => handleUpdateSection(section.id, content)}
                    onDelete={() => handleDeleteSection(section.id)}
                    isEditing={isEditing}
                  />
                )}
                {!["hero", "text", "image", "cta", "video"].includes(section.type) && (
                  <div className="p-6 bg-muted/30 border border-border/50 rounded-2xl text-center">
                    <p className="text-muted-foreground">
                      {section.type} section (component coming soon)
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
} 