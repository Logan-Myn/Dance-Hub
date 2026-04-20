"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { Plus } from "lucide-react";
import { TagIcon } from "@heroicons/react/24/outline";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { DraggableCategory } from "@/components/DraggableCategory";
import { Button } from "@/components/ui/button";
import { CATEGORY_ICONS } from "@/lib/constants";
import type { ThreadCategory } from "@/types/community";

interface ThreadCategoriesEditorProps {
  communitySlug: string;
  initialCategories: ThreadCategory[];
}

export function ThreadCategoriesEditor({
  communitySlug,
  initialCategories,
}: ThreadCategoriesEditorProps) {
  const router = useRouter();
  const [categories, setCategories] = useState<ThreadCategory[]>(initialCategories);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Ported verbatim from CommunitySettingsModal.tsx lines 919-987. The API
  // surface is a single PUT /api/community/[slug]/categories that replaces the
  // entire JSONB `thread_categories` array on the communities row, so add /
  // remove / edit / reorder all mutate local state first and the user commits
  // with the "Save Categories" button.
  const handleAddCategory = () => {
    const newCategory: ThreadCategory = {
      id: crypto.randomUUID(),
      name: "",
      iconType:
        CATEGORY_ICONS[Math.floor(Math.random() * CATEGORY_ICONS.length)].label,
      color: "#000000",
    };
    setCategories([...categories, newCategory]);
  };

  const handleRemoveCategory = (id: string) => {
    setCategories(categories.filter((cat) => cat.id !== id));
  };

  const handleCategoryChange = (
    id: string,
    field: keyof ThreadCategory,
    value: string | boolean
  ) => {
    setCategories(
      categories.map((cat) =>
        cat.id === id ? { ...cat, [field]: value } : cat
      )
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    if (active.id !== over.id) {
      setCategories((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleSaveCategories = async () => {
    try {
      const response = await fetch(
        `/api/community/${communitySlug}/categories`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ categories }),
        }
      );

      if (!response.ok) throw new Error("Failed to update categories");

      toast.success("Categories updated successfully");
      // Refresh so the RSC re-reads `communities.thread_categories` and the
      // persisted order survives navigation away and back.
      router.refresh();
    } catch (error) {
      console.error("Error updating categories:", error);
      toast.error("Failed to update categories");
    }
  };

  return (
    <div id="settings-thread_categories" className="space-y-6">
      {/* Header with Add button */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Organize your community discussions with custom categories
        </p>
        <Button
          onClick={handleAddCategory}
          variant="outline"
          size="sm"
          className="rounded-xl border-border/50 hover:bg-primary/5 hover:border-primary/30 transition-all"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Category
        </Button>
      </div>

      {/* Categories List */}
      <div className="bg-card rounded-2xl border border-border/50 overflow-hidden">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={categories.map((cat) => cat.id)}
            strategy={verticalListSortingStrategy}
          >
            {categories.length > 0 ? (
              <div className="divide-y divide-border/50">
                {categories.map((category) => (
                  <DraggableCategory
                    key={category.id}
                    category={category}
                    onRemove={handleRemoveCategory}
                    onChange={handleCategoryChange}
                  />
                ))}
              </div>
            ) : (
              <div className="p-12 text-center">
                <TagIcon className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-muted-foreground">
                  No categories yet. Add some to help organize threads.
                </p>
              </div>
            )}
          </SortableContext>
        </DndContext>
      </div>

      {/* Save Button */}
      {categories.length > 0 && (
        <Button
          onClick={handleSaveCategories}
          className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-sm hover:shadow-md transition-all duration-200"
        >
          Save Categories
        </Button>
      )}
    </div>
  );
}
