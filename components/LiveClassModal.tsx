"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "react-hot-toast";

interface LiveClassModalProps {
  communityId: string;
  communitySlug: string;
  initialDateTime?: Date | null;
  onClose: () => void;
  onClassCreated: () => void;
}

export default function LiveClassModal({
  communityId,
  communitySlug,
  initialDateTime,
  onClose,
  onClassCreated,
}: LiveClassModalProps) {
  const { session } = useAuth();
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    scheduledDateTime: "",
    scheduledTime: "",
    duration: "60",
    enableRecording: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initialDateTime) {
      const date = format(initialDateTime, 'yyyy-MM-dd');
      const time = format(initialDateTime, 'HH:mm');
      setFormData(prev => ({
        ...prev,
        scheduledDateTime: date,
        scheduledTime: time,
      }));
    }
  }, [initialDateTime]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (!session) {
        toast.error('Please sign in to continue');
        return;
      }

      const scheduledStartTime = new Date(`${formData.scheduledDateTime}T${formData.scheduledTime}`);

      const response = await fetch(`/api/community/${communitySlug}/live-classes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          scheduled_start_time: scheduledStartTime.toISOString(),
          duration_minutes: parseInt(formData.duration),
          community_id: communityId,
          enable_recording: formData.enableRecording,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create live class");
      }

      toast.success("Live class scheduled successfully!");
      onClassCreated();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create live class";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            Schedule Live Class
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-6 w-6 p-0"
            >
              <XMarkIcon className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div>
            <Label htmlFor="title">Class Title *</Label>
            <Input
              id="title"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="e.g., Hip Hop Fundamentals"
              required
            />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Brief description of what will be covered in this class..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="scheduledDateTime">Date *</Label>
              <Input
                id="scheduledDateTime"
                name="scheduledDateTime"
                type="date"
                value={formData.scheduledDateTime}
                onChange={handleChange}
                required
              />
            </div>
            <div>
              <Label htmlFor="scheduledTime">Time *</Label>
              <Input
                id="scheduledTime"
                name="scheduledTime"
                type="time"
                value={formData.scheduledTime}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="duration">Duration (minutes) *</Label>
            <Input
              id="duration"
              name="duration"
              type="number"
              min="15"
              max="240"
              step="15"
              value={formData.duration}
              onChange={handleChange}
              required
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="enableRecording">Record this class</Label>
            <Switch
              id="enableRecording"
              checked={formData.enableRecording}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, enableRecording: checked }))
              }
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !formData.title || !formData.scheduledDateTime || !formData.scheduledTime}
            >
              {loading ? "Creating..." : "Schedule Class"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}