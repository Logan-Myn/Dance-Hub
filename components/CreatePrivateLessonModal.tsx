"use client";

import { useState, useEffect } from "react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { X, Plus } from "lucide-react";
import { toast } from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";

interface CreatePrivateLessonModalProps {
  isOpen: boolean;
  onClose: () => void;
  communitySlug: string;
  onSuccess: () => void;
  editingLesson?: any; // Pass lesson data when editing
}

export default function CreatePrivateLessonModal({
  isOpen,
  onClose,
  communitySlug,
  onSuccess,
  editingLesson,
}: CreatePrivateLessonModalProps) {
  const { session } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    duration_minutes: 60,
    regular_price: "",
    member_price: "",
    location_type: "online" as "online" | "in_person" | "both",
    is_active: true,
    max_bookings_per_month: null as number | null,
    requirements: "",
  });

  // Populate form when editing
  useEffect(() => {
    if (editingLesson && isOpen) {
      setFormData({
        title: editingLesson.title || "",
        description: editingLesson.description || "",
        duration_minutes: editingLesson.duration_minutes || 60,
        regular_price: editingLesson.regular_price ? editingLesson.regular_price.toString() : "",
        member_price: editingLesson.member_price ? editingLesson.member_price.toString() : "",
        location_type: editingLesson.location_type || "online",
        is_active: editingLesson.is_active !== undefined ? editingLesson.is_active : true,
        max_bookings_per_month: editingLesson.max_bookings_per_month || null,
        requirements: editingLesson.requirements || "",
      });
    } else if (!editingLesson && isOpen) {
      // Reset to default values when creating new
      setFormData({
        title: "",
        description: "",
        duration_minutes: 60,
        regular_price: "",
        member_price: "",
        location_type: "online",
        is_active: true,
        max_bookings_per_month: null,
        requirements: "",
      });
    }
  }, [editingLesson, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Validation
      if (!formData.title.trim()) {
        toast.error("Please enter a lesson title");
        return;
      }
      if (!formData.description.trim()) {
        toast.error("Please enter a lesson description");
        return;
      }
      if (!formData.regular_price || parseFloat(formData.regular_price) <= 0) {
        toast.error("Please enter a valid regular price");
        return;
      }
      if (formData.member_price && parseFloat(formData.member_price) >= parseFloat(formData.regular_price)) {
        toast.error("Member price must be less than regular price");
        return;
      }

      const payload = {
        ...formData,
        regular_price: parseFloat(formData.regular_price),
        member_price: formData.member_price ? parseFloat(formData.member_price) : null,
      };

      if (!session) {
        toast.error(`You must be logged in to ${editingLesson ? 'update' : 'create'} private lessons`);
        return;
      }

      const url = editingLesson
        ? `/api/community/${communitySlug}/private-lessons/${editingLesson.id}`
        : `/api/community/${communitySlug}/private-lessons`;

      // Edits go through PUT (full update). PATCH on /lessonId only flips
      // is_active and ignores everything else, which made edits silently
      // fail to persist title/description/prices.
      const method = editingLesson ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Failed to ${editingLesson ? 'update' : 'create'} private lesson`);
      }

      toast.success(`Private lesson ${editingLesson ? 'updated' : 'created'} successfully!`);
      onSuccess();
      onClose();
      
      // Reset form
      setFormData({
        title: "",
        description: "",
        duration_minutes: 60,
        regular_price: "",
        member_price: "",
        location_type: "online",
        is_active: true,
        max_bookings_per_month: null,
        requirements: "",
      });
    } catch (error) {
      console.error("Error creating private lesson:", error);
      toast.error(error instanceof Error ? error.message : "Failed to create private lesson");
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  return (
    <ResponsiveDialog open={isOpen} onOpenChange={onClose}>
      <ResponsiveDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {editingLesson ? 'Edit Private Lesson' : 'Create Private Lesson'}
          </ResponsiveDialogTitle>
        </ResponsiveDialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Lesson Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => handleInputChange("title", e.target.value)}
                placeholder="e.g., Beginner Salsa Fundamentals"
                required
              />
            </div>

            <div>
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange("description", e.target.value)}
                placeholder="Describe what students will learn in this private lesson..."
                rows={4}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="duration">Duration (minutes)</Label>
                <Select
                  value={formData.duration_minutes.toString()}
                  onValueChange={(value) => handleInputChange("duration_minutes", parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 minutes</SelectItem>
                    <SelectItem value="45">45 minutes</SelectItem>
                    <SelectItem value="60">60 minutes</SelectItem>
                    <SelectItem value="90">90 minutes</SelectItem>
                    <SelectItem value="120">120 minutes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="max_bookings_per_month">Max Bookings per Month</Label>
                <Select
                  value={formData.max_bookings_per_month?.toString() || "unlimited"}
                  onValueChange={(value) => handleInputChange("max_bookings_per_month", value === "unlimited" ? null : parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No limit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unlimited">No limit</SelectItem>
                    <SelectItem value="5">5 bookings</SelectItem>
                    <SelectItem value="10">10 bookings</SelectItem>
                    <SelectItem value="15">15 bookings</SelectItem>
                    <SelectItem value="20">20 bookings</SelectItem>
                    <SelectItem value="30">30 bookings</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Pricing</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="regular_price">Regular Price ($) *</Label>
                <Input
                  id="regular_price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.regular_price}
                  onChange={(e) => handleInputChange("regular_price", e.target.value)}
                  placeholder="50.00"
                  required
                />
              </div>

              <div>
                <Label htmlFor="member_price">Member Price ($)</Label>
                <Input
                  id="member_price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.member_price}
                  onChange={(e) => handleInputChange("member_price", e.target.value)}
                  placeholder="40.00 (optional)"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Leave empty if no member discount
                </p>
              </div>
            </div>
          </div>

          {/* Location */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Location</h3>
            <div>
              <Label htmlFor="location_type">Location Type</Label>
              <Select
                value={formData.location_type}
                onValueChange={(value: "online" | "in_person" | "both") => 
                  handleInputChange("location_type", value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="online">Online (Zoom, etc.)</SelectItem>
                  <SelectItem value="in_person">In Person</SelectItem>
                  <SelectItem value="both">Both Options Available</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="requirements">Requirements & Notes</Label>
              <Textarea
                id="requirements"
                value={formData.requirements}
                onChange={(e) => handleInputChange("requirements", e.target.value)}
                placeholder="What should students know or prepare? Any specific requirements or location details..."
                rows={3}
              />
            </div>
          </div>

          {/* Settings */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => handleInputChange("is_active", checked)}
              />
              <Label htmlFor="is_active">Make lesson available for booking</Label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-6 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  {editingLesson ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  {editingLesson ? 'Update Private Lesson' : 'Create Private Lesson'}
                </>
              )}
            </Button>
          </div>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}