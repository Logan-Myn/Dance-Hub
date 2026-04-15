"use client";

import { useState, useEffect } from "react";
import { notFound, useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/app/components/Navbar";
import CommunityNavbar from "@/components/CommunityNavbar";
import PrivateLessonsPage from "@/components/PrivateLessonsPage";
import { toast } from "react-hot-toast";
import { Users } from "lucide-react";

interface Community {
  id: string;
  name: string;
  slug: string;
  description: string;
  image_url: string;
  created_by: string;
  created_at: string;
}

const reservedPaths = [
  'admin',
  'discovery',
  'onboarding',
  'login',
  'register',
  'dashboard',
  'api',
  'auth',
  'components',
  'fonts',
  'favicon.ico',
  'globals.css',
  'robots.txt',
  'sitemap.xml',
];

export default function CommunityPrivateLessonsPage() {
  const params = useParams();
  const communitySlug = params?.communitySlug as string;
  const { user, loading: isAuthLoading } = useAuth();

  const [community, setCommunity] = useState<Community | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMember, setIsMember] = useState(false);
  const [isCreator, setIsCreator] = useState(false);

  if (reservedPaths.includes(communitySlug)) {
    notFound();
  }

  useEffect(() => {
    if (!isAuthLoading) {
      fetchCommunityData();
    }
  }, [communitySlug, user, isAuthLoading]);

  const fetchCommunityData = async () => {
    try {
      // Fetch community data via API
      const communityResponse = await fetch(`/api/community/${communitySlug}`);
      if (!communityResponse.ok) {
        notFound();
        return;
      }
      const communityData = await communityResponse.json();

      setCommunity(communityData);
      setIsCreator(user?.id === communityData.created_by);

      // Check membership if user is logged in
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
      console.error('Error fetching community data:', error);
      toast.error('Failed to load community data');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading || isAuthLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center animate-pulse">
            <Users className="w-6 h-6 text-primary" />
          </div>
          <p className="mt-4 text-muted-foreground font-medium">Loading private lessons...</p>
        </div>
      </div>
    );
  }

  if (!community) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <CommunityNavbar
        communitySlug={communitySlug}
        activePage="private-lessons"
        isMember={isMember}
        isOwner={isCreator}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PrivateLessonsPage
          communitySlug={communitySlug}
          communityId={community.id}
          isCreator={isCreator}
          isMember={isMember}
        />
      </main>
    </div>
  );
} 