// TypeScript interfaces for Live Classes functionality

export interface LiveClass {
  id: string;
  community_id: string;
  teacher_id: string;
  title: string;
  description?: string;
  scheduled_start_time: string;
  duration_minutes: number;
  status: 'scheduled' | 'live' | 'ended' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface LiveClassWithDetails extends LiveClass {
  teacher_name: string;
  teacher_avatar_url?: string;
  community_name: string;
  community_slug: string;
  is_currently_active: boolean;
  is_starting_soon: boolean;
}

export interface LiveClassParticipant {
  id: string;
  live_class_id: string;
  student_id: string;
  joined_at: string;
  left_at?: string;
  created_at: string;
}

export interface CreateLiveClassData {
  title: string;
  description?: string;
  scheduled_start_time: string;
  duration_minutes: number;
  community_id: string;
}

export interface UpdateLiveClassData {
  title?: string;
  description?: string;
  scheduled_start_time?: string;
  duration_minutes?: number;
  status?: 'scheduled' | 'live' | 'ended' | 'cancelled';
}

export interface LiveClassVideoToken {
  roomUrl: string;
  token: string;
  expires: number;
}