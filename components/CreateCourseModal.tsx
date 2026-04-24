"use client";

import { useState, useCallback } from "react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useDropzone } from 'react-dropzone';
import Image from 'next/image';
import { Course } from "@/types/course";
import { slugify } from "@/lib/utils";
import { toast } from "react-hot-toast";

interface CreateCourseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateCourse: (newCourse: {
    title: string;
    description: string;
    image: File | null;
    community_id: string;
    created_at: string;
    updated_at: string;
    slug: string;
    is_public: boolean;
  }) => void;
  communityId: string;
}

export default function CreateCourseModal({
  isOpen,
  onClose,
  onCreateCourse,
  communityId,
}: CreateCourseModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    // Only accept images under 5MB
    if (file.size > 5 * 1024 * 1024) {
      alert('Please upload an image smaller than 5MB');
      return;
    }
    setImage(file);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif']
    },
    maxSize: 5 * 1024 * 1024 // 5MB
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    setIsSubmitting(true);
    try {
      const newCourse = {
        title: title.trim(),
        description: description.trim(),
        image: image,
        community_id: communityId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        slug: slugify(title.trim()),
        is_public: false,
      };

      await onCreateCourse(newCourse);
      setTitle("");
      setDescription("");
      setImage(null);
      onClose();
    } catch (error) {
      console.error('Error creating course:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create course. Please try again.';
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ResponsiveDialog open={isOpen} onOpenChange={onClose}>
      <ResponsiveDialogContent className="sm:max-w-[425px]">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Create Course</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Enter the details for the new course.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 gap-4">
              <label htmlFor="title" className="text-sm font-medium">
                Title
              </label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="col-span-3"
                required
                maxLength={100}
              />
            </div>
            <div className="grid grid-cols-1 gap-4">
              <label htmlFor="description" className="text-sm font-medium">
                Description
              </label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="col-span-3"
                required
                maxLength={500}
              />
            </div>
            <div className="grid grid-cols-1 gap-4">
              <label htmlFor="image" className="text-sm font-medium">
                Course Image
              </label>
              <div 
                {...getRootProps()}
                className={`border-2 border-dashed rounded-md p-4 text-center cursor-pointer ${
                  isDragActive ? 'border-blue-500' : 'border-gray-300'
                }`}
              >
                <input {...getInputProps()} />
                {image ? (
                  <div>
                    <Image 
                      src={URL.createObjectURL(image)}
                      alt="Course Image"
                      width={200}
                      height={200}
                      className="mx-auto object-cover rounded-md"
                    />
                    <p className="mt-2 text-sm text-gray-500">{image.name}</p>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">
                    <p>Drag and drop an image here, or click to select an image</p>
                    <p className="mt-1">Max size: 5MB</p>
                  </div>
                )}
              </div>
            </div>
          </div>
          <ResponsiveDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !title.trim() || !description.trim()}
            >
              {isSubmitting ? 'Creating...' : 'Create Course'}
            </Button>
          </ResponsiveDialogFooter>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
} 