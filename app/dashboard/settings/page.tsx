"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { uploadFileToStorage, STORAGE_FOLDERS } from "@/lib/storage-client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "react-hot-toast";
import { Camera, ChevronLeft, Loader2, RotateCcw } from "lucide-react";
import { EmailPreferencesCard } from "@/components/email-preferences/EmailPreferencesCard";
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY } from "@/components/community-feed/feed-header";
import { Card } from "@/components/community-admin/ui";
import { FIELD_INPUT, FIELD_LABEL } from "@/components/ds/app-dialog";
import { InitialsAvatar } from "@/components/ds/initials-avatar";
import { Skeleton } from "@/components/ds/skeleton";
import { cn } from "@/lib/utils";

interface Profile {
  id: string;
  full_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
  timezone: string;
}

function formatDisplayName(fullName: string | null): string | null {
  if (!fullName) return null;
  const parts = fullName.split(' ');
  if (parts.length < 2) return fullName;
  return `${parts[0]} ${parts[1][0]}.`;
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [isChangingEmail, setIsChangingEmail] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isSavingTimezone, setIsSavingTimezone] = useState(false);
  const [selectedTimezone, setSelectedTimezone] = useState(() =>
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const { user } = useAuth();

  // Check if user signed in via Google (from Better Auth session)
  const isGoogleUser = false; // Will be determined from Better Auth account type

  useEffect(() => {
    async function fetchProfile() {
      if (!user) return;

      try {
        const response = await fetch('/api/profile');
        if (!response.ok) throw new Error('Failed to fetch profile');
        const data = await response.json();
        const fetchedTz: string = data.timezone;
        if (!fetchedTz || fetchedTz === 'UTC') {
          const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          setProfile({ ...data, timezone: browserTz });
          setSelectedTimezone(browserTz);
          fetch('/api/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timezone: browserTz }),
          }).catch(() => {});
        } else {
          setProfile(data);
          setSelectedTimezone(fetchedTz);
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchProfile();
  }, [user]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;

    setIsSaving(true);
    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fullName: profile.full_name,
          displayName: profile.display_name,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error === 'This display name is already taken') {
          toast.error(data.error);
          setIsSaving(false);
          return;
        }
        throw new Error(data.error || 'Failed to update profile');
      }

      toast.success('Profile saved');
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error("Couldn't save your profile. Try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Check file type
    if (!file.type.startsWith('image/')) {
      toast.error('Choose an image file, like a JPG or PNG.');
      return;
    }

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Choose an image under 5 MB.');
      return;
    }

    setIsUploadingAvatar(true);
    try {
      // Upload image to B2 storage via API
      const publicUrl = await uploadFileToStorage(file, STORAGE_FOLDERS.AVATARS);

      // Update profile with new avatar URL
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ avatarUrl: publicUrl }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update profile');
      }

      setProfile(prev => prev ? { ...prev, avatar_url: publicUrl } : null);
      toast.success('Photo updated');

      // Clear the input
      e.target.value = '';
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      toast.error(error.message || "Couldn't upload the photo. Try again.");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const resetDisplayName = () => {
    if (!profile?.full_name) return;
    setProfile(prev => 
      prev ? { ...prev, display_name: null } : null
    );
  };

  const getDisplayedName = () => {
    if (!profile) return '';
    // If there's a custom display name, show it
    if (profile.display_name) return profile.display_name;
    // Otherwise show the formatted name
    return formatDisplayName(profile.full_name) || '';
  };

  const getUserInitial = () => {
    return (
      profile?.display_name?.[0] ||
      profile?.full_name?.[0] ||
      user?.name?.[0] ||
      user?.email?.[0] ||
      'U'
    ).toUpperCase();
  };

  const handleDisplayNameChange = (value: string) => {
    setProfile(prev =>
      prev ? { ...prev, display_name: value || null } : null
    );
  };

  const handleTimezoneChange = async (tz: string) => {
    setSelectedTimezone(tz);
    setProfile(prev => prev ? { ...prev, timezone: tz } : null);
    setIsSavingTimezone(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: tz }),
      });
      if (!res.ok) throw new Error();
      toast.success('Time zone saved');
    } catch {
      toast.error("Couldn't save the time zone. Try again.");
    } finally {
      setIsSavingTimezone(false);
    }
  };

  const handleEmailChange = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!user || !newEmail) return;

    setIsChangingEmail(true);
    try {
      const response = await fetch('/api/auth/change-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          currentEmail: user.email,
          newEmail: newEmail
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send verification email');
      }

      toast.success('Check your new inbox. The change happens once you confirm it there.');
      setNewEmail('');
    } catch (error: any) {
      console.error('Error updating email:', error);
      toast.error(error.message || "Couldn't send the confirmation email. Try again.");
    } finally {
      setIsChangingEmail(false);
    }
  };

  const handlePasswordReset = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!user?.email) return;

    setIsResettingPassword(true);
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: user.email }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send reset email');
      }

      toast.success('Reset link sent. Check your inbox.');
    } catch (error: any) {
      console.error('Error resetting password:', error);
      toast.error(error.message || "Couldn't send the reset link. Try again.");
    } finally {
      setIsResettingPassword(false);
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto flex max-w-[720px] flex-col gap-5 px-4 py-8 sm:px-6" aria-busy="true">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }

  const cardTitle = "font-display text-[17px] font-semibold text-ink";
  const help = "mt-1.5 text-[13px] text-ink-3";

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto flex max-w-[720px] flex-col gap-5 px-4 pb-16 pt-6 sm:px-6 sm:pt-9">
        <div>
          <Link href="/dashboard" className={cn(BTN_GHOST, "-ml-2.5 h-8 px-2.5 text-[13.5px]")}>
            <ChevronLeft aria-hidden="true" />
            Dashboard
          </Link>
          <h1 className="mt-2 font-display text-[28px] font-semibold leading-tight tracking-[-0.01em] text-ink sm:text-[30px]">Settings</h1>
          <p className="mt-1 text-[15px] text-ink-2">Your profile, sign-in details and the emails you get.</p>
        </div>

        <Card as="section" aria-labelledby="profile-h" className="p-5 sm:p-6">
          <form onSubmit={handleUpdateProfile} className="flex flex-col gap-4">
            <h2 id="profile-h" className={cardTitle}>
              Profile
            </h2>
            <div className="flex items-center gap-4">
              <InitialsAvatar id={user?.id ?? "me"} name={getDisplayedName() || getUserInitial()} imageUrl={profile?.avatar_url || user?.image || null} size={72} />
              <div className="flex flex-col gap-1">
                <label className={cn(BTN_SECONDARY, "h-9 cursor-pointer self-start", isUploadingAvatar && "pointer-events-none opacity-60")}>
                  {isUploadingAvatar ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Camera aria-hidden="true" />}
                  {isUploadingAvatar ? "Uploading…" : "Change photo"}
                  <input id="avatar-upload" type="file" accept="image/*" className="sr-only" onChange={handleAvatarUpload} disabled={isUploadingAvatar} />
                </label>
                <span className="text-[12.5px] text-ink-3">JPG or PNG, up to 5 MB.</span>
              </div>
            </div>
            <div>
              <label htmlFor="full-name" className={FIELD_LABEL}>
                Full name
              </label>
              <input
                id="full-name"
                autoComplete="name"
                value={profile?.full_name || ''}
                onChange={(e) => {
                  const newFullName = e.target.value;
                  setProfile((prev) => (prev ? { ...prev, full_name: newFullName } : null));
                }}
                className={FIELD_INPUT}
              />
              <p className={help}>Only you see your full name.</p>
            </div>
            <div>
              <label htmlFor="display-name" className={FIELD_LABEL}>
                Display name
              </label>
              <div className="relative">
                <input
                  id="display-name"
                  value={profile?.display_name || ''}
                  onChange={(e) => handleDisplayNameChange(e.target.value)}
                  placeholder={formatDisplayName(profile?.full_name ?? '') ?? ''}
                  className={cn(FIELD_INPUT, "pr-24")}
                />
                {profile?.display_name && (
                  <button
                    type="button"
                    onClick={resetDisplayName}
                    className="absolute right-1.5 top-1/2 inline-flex h-8 -translate-y-1/2 items-center gap-1 rounded-lg px-2 text-[13px] font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    Reset
                  </button>
                )}
              </div>
              <p className={help}>
                How you appear to others on Dance-Hub. Leave it empty to use &quot;{formatDisplayName(profile?.full_name ?? '')}&quot;.
              </p>
            </div>
            <button type="submit" disabled={isSaving} className={cn(BTN_PRIMARY, "self-end")}>
              {isSaving ? "Saving…" : "Save profile"}
            </button>
          </form>
        </Card>

        <Card as="section" aria-labelledby="email-h" className="flex flex-col gap-4 p-5 sm:p-6">
          <h2 id="email-h" className={cardTitle}>
            Email
          </h2>
          <div>
            <p className={FIELD_LABEL}>Current email</p>
            <p className="rounded-[10px] border border-line bg-surface-2 px-3 py-2.5 text-[15px] text-ink-2">{user?.email}</p>
          </div>
          {isGoogleUser ? (
            <p className="text-[14px] text-ink-2">Your email is managed by Google.</p>
          ) : (
            <div>
              <label htmlFor="new-email" className={FIELD_LABEL}>
                New email
              </label>
              <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                <input
                  id="new-email"
                  type="email"
                  autoComplete="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className={FIELD_INPUT}
                />
                <button type="button" onClick={handleEmailChange} disabled={isChangingEmail || !newEmail} className={cn(BTN_SECONDARY, "h-auto shrink-0")}>
                  {isChangingEmail ? "Sending…" : "Change email"}
                </button>
              </div>
              <p className={help}>We send a link to the new address. The change happens once you confirm it there.</p>
            </div>
          )}
        </Card>

        {!isGoogleUser && (
          <Card as="section" aria-labelledby="password-h" className="flex flex-wrap items-center gap-4 p-5 sm:p-6">
            <div className="min-w-0 flex-1">
              <h2 id="password-h" className={cardTitle}>
                Password
              </h2>
              <p className="mt-1 text-[14px] text-ink-2">We email you a link to choose a new password.</p>
            </div>
            <button type="button" onClick={handlePasswordReset} disabled={isResettingPassword} className={BTN_SECONDARY}>
              {isResettingPassword ? "Sending…" : "Send a reset link"}
            </button>
          </Card>
        )}

        <Card as="section" aria-labelledby="tz-h" className="flex flex-col gap-3 p-5 sm:p-6">
          <div>
            <h2 id="tz-h" className={cardTitle}>
              Time zone
            </h2>
            <p className="mt-1 text-[14px] text-ink-2">Lesson and class times are shown in this time zone.</p>
          </div>
          <div>
            <label htmlFor="timezone-select" className={FIELD_LABEL}>
              Your time zone
            </label>
            <select
              id="timezone-select"
              value={selectedTimezone}
              onChange={(e) => handleTimezoneChange(e.target.value)}
              disabled={isSavingTimezone}
              className={cn(FIELD_INPUT, "h-10 py-0")}
            >
              {Intl.supportedValuesOf('timeZone').map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
        </Card>

        <EmailPreferencesCard />
      </div>
    </div>
  );
}
