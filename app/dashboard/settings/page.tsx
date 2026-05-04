"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadFileToStorage, STORAGE_FOLDERS } from "@/lib/storage-client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "react-hot-toast";
import { User2, Mail, Camera, AtSign, RefreshCw } from "lucide-react";
import { EmailPreferencesCard } from "@/components/email-preferences/EmailPreferencesCard";

interface Profile {
  id: string;
  full_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
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
        setProfile(data);
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

      toast.success('Profile updated successfully');
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Check file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size should be less than 5MB');
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
      toast.success('Avatar updated successfully');

      // Clear the input
      e.target.value = '';
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      toast.error(error.message || 'Failed to upload avatar');
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

  const getUserInitials = () => {
    const name = profile?.display_name || profile?.full_name || user?.name;
    if (name) {
      const parts = name.split(' ');
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
      return name.substring(0, 2).toUpperCase();
    }
    return user?.email ? user.email.substring(0, 2).toUpperCase() : 'U';
  };

  const handleDisplayNameChange = (value: string) => {
    setProfile(prev =>
      prev ? { ...prev, display_name: value || null } : null
    );
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

      toast.success('Verification email sent. Please check your new email to confirm the change.');
      setNewEmail('');
    } catch (error: any) {
      console.error('Error updating email:', error);
      toast.error(error.message || 'Failed to send verification email');
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

      toast.success('Password reset email sent. Please check your email to reset your password.');
    } catch (error: any) {
      console.error('Error resetting password:', error);
      toast.error(error.message || 'Failed to send reset email');
    } finally {
      setIsResettingPassword(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-4">Settings</h1>
        <p className="text-gray-600">Manage your account settings and profile</p>
      </div>

      <form onSubmit={handleUpdateProfile}>
        <Card>
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Avatar Upload */}
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={profile?.avatar_url || user?.image || undefined} alt="Profile" />
                  <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
                    {getUserInitials()}
                  </AvatarFallback>
                </Avatar>
                <Label
                  htmlFor="avatar-upload"
                  className={`absolute bottom-0 right-0 p-1 bg-white rounded-full shadow-lg cursor-pointer hover:bg-gray-100 ${
                    isUploadingAvatar ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {isUploadingAvatar ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-900 border-t-transparent" />
                  ) : (
                    <Camera className="h-4 w-4" />
                  )}
                  <Input
                    id="avatar-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                    disabled={isUploadingAvatar}
                  />
                </Label>
              </div>
              <div>
                <h3 className="font-medium">Profile Picture</h3>
                <p className="text-sm text-gray-500">
                  {isUploadingAvatar 
                    ? 'Uploading...' 
                    : 'Click the camera icon to upload a new photo'}
                </p>
              </div>
            </div>

            {/* Full Name */}
            <div className="space-y-2">
              <Label htmlFor="full-name">Full Name</Label>
              <div className="relative">
                <User2 className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="full-name"
                  value={profile?.full_name || ''}
                  onChange={(e) => {
                    const newFullName = e.target.value;
                    setProfile(prev => 
                      prev ? { ...prev, full_name: newFullName } : null
                    );
                  }}
                  className="pl-10"
                  placeholder="Enter your full name"
                />
              </div>
              <p className="text-sm text-gray-500">
                Your full name is only visible to you
              </p>
            </div>

            {/* Display Name */}
            <div className="space-y-2">
              <Label htmlFor="display-name">Display Name</Label>
              <div className="relative">
                <AtSign className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="display-name"
                  value={profile?.display_name || ''}
                  onChange={(e) => handleDisplayNameChange(e.target.value)}
                  className="pl-10 pr-24"
                  placeholder={formatDisplayName(profile?.full_name ?? '') ?? "Enter your display name"}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetDisplayName}
                  className="absolute right-2 top-2 h-8 px-2 text-gray-500 hover:text-gray-700"
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Reset
                </Button>
              </div>
              <p className="text-sm text-gray-500">
                This is how you'll appear across the platform. Leave empty to use "{formatDisplayName(profile?.full_name ?? '')}"
              </p>
            </div>

            {/* Email Change Form */}
            <div className="space-y-2">
              <Label htmlFor="current-email">Current Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="current-email"
                  value={user?.email || ''}
                  disabled
                  className="pl-10 bg-gray-50"
                />
              </div>
              
              {isGoogleUser ? (
                <p className="text-sm text-gray-500 mt-2">
                  Your email is managed by Google.
                </p>
              ) : (
                <>
                  <div className="space-y-4 mt-4">
                    <div>
                      <Label htmlFor="new-email">New Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          id="new-email"
                          type="email"
                          value={newEmail}
                          onChange={(e) => setNewEmail(e.target.value)}
                          className="pl-10"
                          placeholder="Enter new email address"
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      onClick={handleEmailChange}
                      disabled={isChangingEmail || !newEmail}
                      className="bg-black hover:bg-gray-800 text-white"
                    >
                      {isChangingEmail ? 'Sending Verification...' : 'Change Email'}
                    </Button>
                  </div>
                  <p className="text-sm text-gray-500 mt-2">
                    You'll need to verify your new email address before the change takes effect
                  </p>
                </>
              )}
            </div>

            {/* Password Reset Section */}
            {!isGoogleUser && (
              <div className="space-y-2">
                <Label>Password</Label>
                <Card className="border border-gray-200">
                  <CardContent className="pt-6">
                    <div className="space-y-4">
                      <p className="text-sm text-gray-500">
                        Need to change your password? Click below to receive a password reset email.
                      </p>
                      <Button
                        type="button"
                        onClick={handlePasswordReset}
                        disabled={isResettingPassword}
                        className="bg-black hover:bg-gray-800 text-white w-full"
                      >
                        {isResettingPassword ? 'Sending Reset Email...' : 'Reset Password'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={isSaving}
                className="bg-black hover:bg-gray-800 text-white"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      <EmailPreferencesCard />
    </div>
  );
}