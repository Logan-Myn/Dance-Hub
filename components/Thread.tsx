"use client";

import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { toast } from "react-hot-toast";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { MessageCircle, Pin } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Switch } from "./ui/switch";
import { CATEGORY_ICONS } from "@/lib/constants";
import Editor from "./Editor";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { formatDisplayName } from "@/lib/utils";

interface ThreadProps {
  communityId: string;
  userId: string;
  communityName: string;
  community: any;
  onSave: (newThread: any) => void;
  onCancel: () => void;
}

export default function Thread({
  communityId,
  userId,
  communityName,
  community,
  onSave,
  onCancel,
}: ThreadProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const { user, session } = useAuth();
  const [content, setContent] = useState("");
  const [profile, setProfile] = useState<any>(null);

  const isCreator = user?.id === community.created_by;

  // Fetch user's profile data
  useEffect(() => {
    async function fetchProfile() {
      if (!user) return;

      try {
        const response = await fetch(`/api/profile?userId=${user.id}`);
        if (response.ok) {
          const data = await response.json();
          setProfile(data);
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
      }
    }

    fetchProfile();
  }, [user]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Write your post here...',
      }),
    ],
    immediatelyRender: false,
  });

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error("Please enter a title");
      return;
    }

    if (!content || content === '<p></p>') {
      toast.error("Please write something before posting");
      return;
    }

    if (!selectedCategory) {
      toast.error("Please select a category");
      return;
    }

    if (!user) {
      toast.error("Please sign in to create a thread");
      return;
    }

    setIsSubmitting(true);

    try {
      if (!session) {
        throw new Error('No active session');
      }

      const response = await fetch("/api/threads/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: title.trim(),
          content,
          communityId,
          userId: user.id,
          categoryId: selectedCategory,
          categoryName: community.thread_categories?.find(
            (cat: { id: string; name: string }) => cat.id === selectedCategory
          )?.name,
          pinned: isCreator ? isPinned : false,
          author: {
            id: user.id,
            name: profile?.display_name || profile?.full_name || 'Anonymous',
            avatar_url: profile?.avatar_url || user?.image,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 403) {
          throw new Error(errorData.error || 'You do not have permission to post in this category');
        } else {
          throw new Error(errorData.error || 'Failed to create thread');
        }
      }

      const newThread = await response.json();
      toast.success("Thread created successfully");
      setContent("");
      setTitle("");
      setSelectedCategory("");
      onSave(newThread);
    } catch (error) {
      console.error("Error creating thread:", error);
      if (error instanceof Error) {
        if (error.message.includes('session')) {
          toast.error('Please sign in again to create a thread');
        } else {
          toast.error(error.message);
        }
      } else {
        toast.error('Failed to create thread. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const userDisplayName = profile?.display_name || profile?.full_name || user?.email?.split('@')[0] || 'Anonymous';
  const userAvatarUrl = profile?.avatar_url || user?.image;
  const userInitial = userDisplayName[0]?.toUpperCase() || 'A';

  return (
    <div className="space-y-4">
      {/* Header with user info and category selection */}
      <div className="flex items-start space-x-2">
        <Avatar className="h-10 w-10 shrink-0">
          <AvatarImage
            src={userAvatarUrl || ""}
            alt={userDisplayName}
          />
          <AvatarFallback>{userInitial}</AvatarFallback>
        </Avatar>
        <div className="text-sm flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-0 sm:space-x-2 flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="font-medium">{userDisplayName}</span>
            <span className="text-gray-500">posting in</span>
          </div>
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-full sm:w-[200px] border-none bg-transparent hover:bg-gray-50 focus:ring-0">
              <SelectValue placeholder="Choose a category" />
            </SelectTrigger>
            <SelectContent>
              {community.thread_categories
                ?.filter((category: { creatorOnly: boolean }) => !category.creatorOnly || isCreator)
                .map((category: any) => {
                  const iconConfig = CATEGORY_ICONS.find(
                    (i) => i.label === category.iconType
                  );
                  const IconComponent = iconConfig?.icon || MessageCircle;

                  return (
                    <SelectItem key={category.id} value={category.id}>
                      <div className="flex items-center space-x-2">
                        <IconComponent
                          className="h-4 w-4"
                          style={{ color: iconConfig?.color }}
                        />
                        <span>{category.name}</span>
                        {category.creatorOnly && (
                          <span className="ml-2 text-xs text-gray-500">(Creator only)</span>
                        )}
                      </div>
                    </SelectItem>
                  );
                })}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Title input */}
      <input
        type="text"
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="text-lg font-medium border-none bg-transparent px-0 focus:outline-none w-full"
      />

      {/* Editor Component */}
      <Editor
        content={content}
        onChange={(html) => setContent(html)}
        editable={true}
        showHeadings={false}
        showParagraphStyle={false}
        showAlignment={false}
        placeholder="Write your post here..."
        minHeight="120px"
      />

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2 pt-4 border-t">
        {isCreator && (
          <div className="flex items-center gap-2 w-full sm:w-auto sm:mr-auto">
            <Switch
              checked={isPinned}
              onCheckedChange={setIsPinned}
              id="pin-thread"
            />
            <label htmlFor="pin-thread" className="text-sm flex items-center space-x-1 cursor-pointer">
              <Pin className="h-4 w-4" />
              <span>Pin this thread</span>
            </label>
          </div>
        )}
        <div className="flex gap-2 ml-auto">
          <Button variant="ghost" onClick={onCancel} disabled={isSubmitting}>
            CANCEL
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !user}
            className="bg-gray-200 hover:bg-gray-300 text-gray-800"
          >
            {isSubmitting ? "Posting..." : "POST"}
          </Button>
        </div>
      </div>
    </div>
  );
}
