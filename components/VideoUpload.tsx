"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";

interface VideoUploadProps {
  communityId: string;
  onUploadComplete: (assetId: string, playbackId: string) => void;
  onUploadError: (error: string) => void;
}

export default function VideoUpload({
  communityId,
  onUploadComplete,
  onUploadError,
}: VideoUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);
  const { session } = useAuth();

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const handleUpload = async (file: File) => {
    try {
      setIsUploading(true);
      setUploadProgress(0);

      if (!session) {
        throw new Error("Authentication required");
      }

      // Get upload URL
      const response = await fetch("/api/mux/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ communityId }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Failed to get upload URL:", response.status, errorText);
        throw new Error(`Failed to get upload URL: ${response.status} ${errorText}`);
      }

      const { uploadId, uploadUrl } = await response.json();

      // Create a promise to handle the upload
      const uploadPromise = new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(progress);
          }
        });

        xhr.addEventListener("load", () => {
          // 204 is success for Mux uploads
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        });

        xhr.addEventListener("error", () => {
          console.error("XMLHttpRequest error:", {
            status: xhr.status,
            statusText: xhr.statusText,
            readyState: xhr.readyState,
            uploadUrl: uploadUrl
          });
          reject(new Error(`Network error during upload: ${xhr.status} ${xhr.statusText}`));
        });

        xhr.open("PUT", uploadUrl);
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
          throw new Error("Upload cancelled");
        }
        if (attempts >= maxAttempts) {
          throw new Error("Timeout waiting for asset to be ready");
        }

        try {
          const assetResponse = await fetch(`/api/mux/assets/${uploadId}`);

          if (!assetResponse.ok) {
            throw new Error("Failed to check asset status");
          }

          const asset = await assetResponse.json();

          if (asset.status === "ready") {
            return asset;
          }

          attempts++;
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
          return pollAsset();
        } catch (error) {
          console.error("Error polling asset:", error);
          throw error;
        }
      };

      const readyAsset = await pollAsset();
      if (cancelledRef.current) return;
      onUploadComplete(readyAsset.id, readyAsset.playbackId);
      setIsUploading(false);
      setSelectedFile(null);
      toast.success("Video uploaded successfully!");
    } catch (error) {
      console.error("Upload error:", error);
      setIsUploading(false);
      setSelectedFile(null);
      onUploadError(error instanceof Error ? error.message : "Upload failed");
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
      if (file.size > 500 * 1024 * 1024) {
        // 500MB limit
        toast.error("File size must be less than 500MB");
        return;
      }
      setSelectedFile(file);
      handleUpload(file);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 500 * 1024 * 1024) {
        // 500MB limit
        toast.error("File size must be less than 500MB");
        return;
      }
      setSelectedFile(file);
      handleUpload(file);
    }
  };

  const cancelUpload = () => {
    setSelectedFile(null);
    setUploadProgress(0);
  };

  return (
    <div
      className={`relative border-2 border-dashed rounded-lg p-6 transition-colors ${
        isDragging
          ? "border-blue-500 bg-blue-50"
          : "border-gray-300 hover:border-gray-400"
      }`}
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

      <div className="flex flex-col items-center justify-center space-y-4">
        <Upload className="w-12 h-12 text-gray-400" />
        <div className="text-center">
          <p className="text-lg font-medium">
            Drag and drop your video here, or{" "}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-blue-500 hover:text-blue-600"
              disabled={isUploading}
            >
              browse
            </button>
          </p>
          <p className="text-sm text-gray-500 mt-1">Maximum file size: 500MB</p>
        </div>
      </div>

      {selectedFile && (
        <div className="mt-4 text-sm text-gray-500">
          Selected: {selectedFile.name}
        </div>
      )}

      {isUploading && (
        <div className="mt-4 space-y-2">
          <Progress value={uploadProgress} className="w-full" />
          <div className="text-sm text-gray-500">
            {uploadProgress === 100
              ? "Processing..."
              : `Uploading... ${uploadProgress}%`}
          </div>
        </div>
      )}
    </div>
  );
}
