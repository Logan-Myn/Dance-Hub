"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PageBuilder from "@/components/PageBuilder";
import { Section } from "@/types/page-builder";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "react-hot-toast";

interface InitialCommunity {
  id: string;
  name: string;
  slug: string;
  description: string;
  created_by: string;
  membership_enabled?: boolean;
  membership_price?: number;
  stripe_account_id?: string | null;
  status?: 'active' | 'pre_registration' | 'inactive';
  opening_date?: string | null;
  about_page?: {
    sections: Section[];
    meta: { last_updated: string; published_version?: string };
  } | null;
}

interface AboutClientProps {
  communitySlug: string;
  community: InitialCommunity;
  isCreator: boolean;
  isMember: boolean;
}

export default function AboutClient({
  communitySlug,
  community: initialCommunity,
  isCreator,
  isMember,
}: AboutClientProps) {
  const { session } = useAuth();
  const router = useRouter();
  const [community, setCommunity] = useState<InitialCommunity>(initialCommunity);
  const [isSaving, setIsSaving] = useState(false);

  const handleSectionsChange = (sections: Section[]) => {
    setCommunity((prev) => ({
      ...prev,
      about_page: {
        sections,
        meta: {
          last_updated: new Date().toISOString(),
          published_version: prev.about_page?.meta?.published_version,
        },
      },
    }));
  };

  const handleSave = async () => {
    if (!session) return;
    setIsSaving(true);
    try {
      const response = await fetch(`/api/community/${communitySlug}/about`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aboutPage: {
            sections: community.about_page?.sections || [],
            meta: {
              last_updated: new Date().toISOString(),
              published_version: community.about_page?.meta?.published_version,
            },
          },
        }),
      });
      if (!response.ok) throw new Error('Failed to save about page');
      toast.success("Changes saved successfully");
      // Purge the Router Cache so a nav-away-and-back picks up the new
      // sections from the server-fetched initialCommunity.
      router.refresh();
    } catch (error) {
      console.error("Error saving about page:", error);
      toast.error("Failed to save changes. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <PageBuilder
        initialSections={community.about_page?.sections || []}
        onChange={handleSectionsChange}
        onSave={handleSave}
        isEditing={isCreator}
        isSaving={isSaving}
        communityData={{
          id: community.id,
          slug: communitySlug,
          name: community.name,
          membershipEnabled: community.membership_enabled,
          membershipPrice: community.membership_price,
          stripeAccountId: community.stripe_account_id,
          isMember,
          status: community.status,
          opening_date: community.opening_date,
        }}
      />
    </div>
  );
}
