"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import useSWR from 'swr';
import { fetcher, type Community } from '@/lib/fetcher';
import { useState, useMemo } from 'react';

export default function DiscoveryClient() {
  const { user: currentUser } = useAuth();
  const { showAuthModal } = useAuthModal();
  const { data: communities, error, isLoading } = useSWR(
    currentUser ? `communities:${currentUser.id}` : 'communities',
    fetcher
  );
  const [searchQuery, setSearchQuery] = useState("");

  const handleCreateCommunity = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!currentUser) {
      e.preventDefault();
      showAuthModal("signup");
    }
  };

  const filteredCommunities = useMemo(() => {
    if (!communities) return [];
    
    let filtered = [...communities];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        community =>
          community.name.toLowerCase().includes(query) ||
          (community.description?.toLowerCase() || "").includes(query)
      );
    }

    return filtered;
  }, [communities, searchQuery]);

  const handleCommunityClick = (e: React.MouseEvent<HTMLButtonElement>, community: Community) => {
    e.preventDefault();
    
    if (!currentUser) {
      showAuthModal("signup");
      return;
    }

    window.location.href = `/${community.slug}`;
  };

  return (
    <div className="container mx-auto px-4 py-8">
        <main>
          <h2 className="text-4xl font-bold text-center mb-4">
            Discover dance communities
          </h2>
          <p className="text-center mb-8">
            or{" "}
            <Link
              href="/onboarding"
              className="text-blue-500 hover:underline"
              onClick={handleCreateCommunity}
            >
              create your own
            </Link>
          </p>
          <div className="relative mb-8">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <Input
              className="pl-10"
              placeholder="Search dance styles, teachers, and more"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex space-x-4 mb-8 overflow-x-auto">
            <Button variant="secondary">All</Button>
            <Button variant="ghost">Ballet</Button>
            <Button variant="ghost">Hip Hop</Button>
            <Button variant="ghost">Contemporary</Button>
            <Button variant="ghost">Salsa</Button>
            <Button variant="ghost">Breakdancing</Button>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center min-h-[200px]">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            </div>
          ) : error ? (
            <div className="text-center text-red-500">
              Error loading communities. Please try again later.
            </div>
          ) : !filteredCommunities.length ? (
            <div className="text-center text-gray-500">No communities found</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredCommunities.map((community: Community) => (
                <Link
                  href={`/${community.slug}`}
                  key={community.id}
                  className="block border rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300"
                >
                  <div className="relative w-full h-48">
                    <Image
                      alt={community.name}
                      src={community.image_url || "/placeholder.svg"}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                      priority={false}
                    />
                    {community.status === 'pre_registration' && (
                      <div className="absolute top-2 right-2 bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-semibold shadow-lg">
                        Pre-Registration
                      </div>
                    )}
                    {community.status === 'inactive' && (
                      <div className="absolute top-2 right-2 bg-gray-600 text-white px-3 py-1 rounded-full text-sm font-semibold shadow-lg">
                        Inactive
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="text-xl font-semibold mb-2">
                      {community.name}
                    </h3>
                    <p className="text-gray-600 mb-4">
                      {community.description || "No description available"}
                    </p>
                    {community.status === 'pre_registration' && community.opening_date && (
                      <p className="text-sm text-blue-600 font-medium mb-2">
                        Opens: {new Date(community.opening_date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </p>
                    )}
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-500">
                        {community.privacy || "Public"} • {community.membersCount}{" "}
                        Members
                      </span>
                      <Button
                        variant="outline"
                        onClick={(e) => handleCommunityClick(e, community)}
                        className="hover:bg-blue-500 hover:text-white"
                        disabled={community.status === 'inactive'}
                      >
                        {community.isMember
                          ? "Enter"
                          : community.status === 'pre_registration'
                            ? "Pre-Register"
                            : community.status === 'inactive'
                              ? "Inactive"
                              : "Join"}
                      </Button>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
      </main>
    </div>
  );
}