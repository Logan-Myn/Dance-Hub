"use client";

import { useState, useEffect } from "react";
import { useParams, notFound } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/app/components/Navbar";
import CommunityNavbar from "@/components/CommunityNavbar";
import PageBuilder from "@/components/PageBuilder";
import { Section } from "@/types/page-builder";
import { toast } from "react-hot-toast";

interface Community {
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
    meta: {
      last_updated: string;
      published_version?: string;
    };
  };
}

export default function AboutPage() {
  const params = useParams();
  const communitySlug = params?.communitySlug as string;
  const { user, session } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [community, setCommunity] = useState<Community | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isMember, setIsMember] = useState(false);

  // Initial data fetch
  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch community data via API
        const communityResponse = await fetch(`/api/community/${communitySlug}`);
        if (!communityResponse.ok) {
          if (communityResponse.status === 404) {
            notFound();
            return;
          }
          throw new Error('Failed to fetch community');
        }
        const communityData = await communityResponse.json();

        // Fetch about page data separately
        const aboutResponse = await fetch(`/api/community/${communitySlug}/about`);
        if (aboutResponse.ok) {
          const aboutData = await aboutResponse.json();
          communityData.about_page = aboutData.aboutPage;
        }

        setCommunity(communityData);

        // Check if user is a member
        if (user) {
          const memberResponse = await fetch(`/api/community/${communitySlug}/check-subscription`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id }),
          });
          if (memberResponse.ok) {
            const memberData = await memberResponse.json();
            setIsMember(memberData.hasSubscription);
          }
        }
      } catch (error) {
        console.error("Error fetching community:", error);
        setError(error instanceof Error ? error : new Error('Unknown error'));
      } finally {
        setIsLoading(false);
      }
    }

    if (communitySlug) {
      fetchData();
    }
  }, [communitySlug, user]);

  const handleSectionsChange = (sections: Section[]) => {
    if (!community) return;

    setCommunity((prev) => ({
      ...prev!,
      about_page: {
        sections,
        meta: {
          last_updated: new Date().toISOString(),
          published_version: prev?.about_page?.meta.published_version,
        },
      },
    }));
  };

  const handleSave = async () => {
    if (!user || !community?.id || !session) return;

    setIsSaving(true);
    try {
      // Save about page via API
      const response = await fetch(`/api/community/${communitySlug}/about`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aboutPage: {
            sections: community.about_page?.sections || [],
            meta: {
              last_updated: new Date().toISOString(),
              published_version: community.about_page?.meta.published_version,
            },
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save about page');
      }

      toast.success("Changes saved successfully");
    } catch (error) {
      console.error("Error saving about page:", error);
      toast.error("Failed to save changes. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  if (error) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <Navbar />
        <main className="flex-grow flex items-center justify-center">
          <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-8 max-w-md text-center">
            <h2 className="font-display text-xl font-semibold text-destructive mb-2">
              Error loading community
            </h2>
            <p className="text-muted-foreground">{error.message}</p>
          </div>
        </main>
      </div>
    );
  }

  if (isLoading || !community) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-background">
        <div className="relative">
          <div className="h-12 w-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-6 w-6 rounded-full bg-primary/10 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  const isCreator = user?.id === community.created_by;

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Navbar />
      <CommunityNavbar
        communitySlug={communitySlug}
        activePage="about"
        isMember={isMember}
        isOwner={isCreator}
      />
      <main className="flex-grow">
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
              isMember: isMember,
              status: community.status,
              opening_date: community.opening_date
            }}
          />
        </div>
      </main>
    </div>
  );
} 