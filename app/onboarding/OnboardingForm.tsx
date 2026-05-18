"use client";

import React, { useState } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRouter } from 'next/navigation';
import { useAuth } from "@/contexts/AuthContext";
import toast from 'react-hot-toast';
import { Textarea } from "@/components/ui/textarea";
import { UploadCloud, X } from 'lucide-react';
import { uploadFileToStorage, STORAGE_FOLDERS } from '@/lib/storage-client';
import { BannerCropper, type BannerCropValue } from '@/components/admin/BannerCropper';

export default function OnboardingForm() {
  const [communityName, setCommunityName] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<BannerCropValue>({ focalX: 50, focalY: 50, zoom: 1 });
  const [nameError, setNameError] = useState<string | null>(null);
  const { user } = useAuth();
  const router = useRouter();

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size should be less than 5MB");
      return;
    }

    setImageFile(file);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(URL.createObjectURL(file));
    setCrop({ focalX: 50, focalY: 50, zoom: 1 });
  };

  const removeImage = () => {
    setImageFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setCrop({ focalX: 50, focalY: 50, zoom: 1 });
  };

  // Function to generate slug from name
  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  };

  // Function to check name and slug availability
  const checkAvailability = async (name: string) => {
    const slug = generateSlug(name);

    try {
      const response = await fetch(
        `/api/community/check-availability?name=${encodeURIComponent(name)}&slug=${encodeURIComponent(slug)}`
      );

      if (!response.ok) {
        console.error('Error checking availability');
        return false;
      }

      const data = await response.json();

      if (!data.available) {
        setNameError(data.reason);
        return false;
      }

      setNameError(null);
      return true;
    } catch (error) {
      console.error('Error checking availability:', error);
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsLoading(true);

    try {
      // Check availability before proceeding
      const isAvailable = await checkAvailability(communityName);
      if (!isAvailable) {
        setIsLoading(false);
        return;
      }

      let imageUrl = '';

      // Upload image if one is selected
      if (imageFile) {
        setIsUploading(true);
        try {
          imageUrl = await uploadFileToStorage(imageFile, STORAGE_FOLDERS.COMMUNITY_IMAGES);
        } finally {
          setIsUploading(false);
        }
      }

      const response = await fetch('/api/community/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: communityName,
          description: description,
          imageUrl: imageUrl,
          createdBy: user.id,
          ...(imageUrl ? { focalX: crop.focalX, focalY: crop.focalY, zoom: crop.zoom } : {}),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create community');
      }

      if (data.warning) {
        toast.success('Community created successfully, but there was a minor issue.');
        console.warn(data.warning);
      } else {
        toast.success('Community created successfully!');
      }

      // Redirect to the newly created community page
      router.push(`/${data.slug}`);
    } catch (error) {
      console.error('Error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create community');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Community name
        </label>
        <Input
          type="text"
          value={communityName}
          onChange={async (e) => {
            const newName = e.target.value;
            setCommunityName(newName);
            if (newName.length > 2) {
              await checkAvailability(newName);
            } else {
              setNameError(null);
            }
          }}
          placeholder="Enter your community name"
          required
          className={`w-full ${nameError ? 'border-red-500' : ''}`}
        />
        {nameError && (
          <p className="mt-1 text-sm text-red-500">{nameError}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Description
        </label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Tell us about your community"
          required
          className="w-full min-h-[100px]"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Community photo
        </label>
        {previewUrl && imageFile ? (
          <div className="space-y-2">
            <div className="relative">
              <BannerCropper key={previewUrl} imageUrl={previewUrl} onChange={setCrop} />
              <button
                type="button"
                onClick={removeImage}
                className="absolute -top-2 -right-2 p-1 bg-red-100 rounded-full hover:bg-red-200 transition-colors z-10"
                aria-label="Remove image"
              >
                <X className="h-4 w-4 text-red-500" />
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Drag and zoom to choose what shows in the banner. {imageFile.name}
            </p>
          </div>
        ) : (
          <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg">
            <div className="w-full max-w-2xl space-y-1 text-center">
              <div className="flex flex-col items-center">
                <UploadCloud className="mx-auto h-12 w-12 text-gray-400" />
                <div className="flex text-sm text-gray-600">
                  <label htmlFor="file-upload" className="relative cursor-pointer rounded-md font-medium text-blue-600 hover:text-blue-500">
                    <span>Upload a file</span>
                    <input
                      id="file-upload"
                      name="file-upload"
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={handleImageUpload}
                      disabled={isUploading}
                    />
                  </label>
                  <p className="pl-1">or drag and drop</p>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                PNG, JPG, GIF up to 5MB. Wide images (around 1600x400) work best.
              </p>
            </div>
          </div>
        )}
      </div>

      <Button 
        type="submit" 
        disabled={isLoading || isUploading} 
        className="w-full"
      >
        {isLoading ? 'Creating your community...' : 'Create Community'}
      </Button>
    </form>
  );
}