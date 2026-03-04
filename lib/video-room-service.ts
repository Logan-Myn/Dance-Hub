import { sql, query, queryOne } from "@/lib/db";

/**
 * Consolidated Video Room Service
 *
 * Handles the entire lifecycle of Daily.co video rooms for private lessons:
 * - Room creation and management
 * - Token generation for secure access
 * - Session tracking and cleanup
 * - Error handling and retry logic
 *
 * Migrated from Supabase to Neon database
 */

// Daily.co API configuration
const DAILY_API_KEY = process.env.DAILY_API_KEY;
const DAILY_API_URL = 'https://api.daily.co/v1';

if (!DAILY_API_KEY) {
  console.warn('DAILY_API_KEY is not set in environment variables');
}

// Types for Daily.co API
export interface DailyRoomConfig {
  name?: string;
  privacy?: 'private' | 'public';
  properties?: {
    max_participants?: number;
    exp?: number;
    eject_at_room_exp?: boolean;
    enable_chat?: boolean;
    enable_screenshare?: boolean;
    enable_recording?: string; // 'cloud' | 'local' | 'raw-tracks'
    owner_only_broadcast?: boolean;
    enable_knocking?: boolean;
    lang?: string;
  };
}

export interface DailyMeetingToken {
  room_name: string;
  user_name?: string;
  user_id?: string;
  is_owner?: boolean;
  exp?: number;
  enable_screenshare?: boolean;
  start_video_off?: boolean;
  start_audio_off?: boolean;
  permissions?: {
    canSend?: boolean | string[];
    canAdmin?: string[];
  };
}

export interface VideoRoomResult {
  success: boolean;
  roomName?: string;
  roomUrl?: string;
  teacherToken?: string;
  studentToken?: string;
  error?: string;
  expiresAt?: string;
}

// Database types
interface BookingDetails {
  id: string;
  private_lesson_id: string;
  student_id: string;
  student_name: string | null;
  community_id: string;
  payment_status: string;
  scheduled_at: string | null;
  daily_room_name: string | null;
  daily_room_url: string | null;
  daily_room_expires_at: string | null;
  teacher_daily_token: string | null;
  student_daily_token: string | null;
  lesson_title: string;
  lesson_duration_minutes: number;
  lesson_location_type: string;
  lesson_teacher_id: string;
  community_slug: string;
  community_created_by: string;
}

interface BookingSession {
  session_started_at: string | null;
  teacher_joined_at: string | null;
  student_joined_at: string | null;
}

interface ExpiredBooking {
  id: string;
  daily_room_name: string | null;
}

interface LiveClassDetails {
  id: string;
  title: string;
  description: string | null;
  scheduled_start_time: string;
  duration_minutes: number;
  daily_room_name: string | null;
  daily_room_url: string | null;
  daily_room_expires_at: string | null;
  community_id: string;
  created_by: string;
}

export class VideoRoomService {
  /**
   * Create a complete video room setup for a booking
   * This includes room creation, token generation, and database updates
   */
  async createRoomForBooking(bookingId: string): Promise<VideoRoomResult> {
    try {
      console.log(`🎬 Creating video room for booking: ${bookingId}`);

      // Get booking details with related data
      const booking = await this.getBookingDetails(bookingId);

      // Validate booking can have video room
      this.validateBookingForVideo(booking);

      // Check if room already exists
      if (booking.daily_room_name) {
        console.log(`⚠️ Video room already exists for booking: ${bookingId}`);
        return {
          success: true,
          roomName: booking.daily_room_name,
          roomUrl: booking.daily_room_url ?? undefined,
          teacherToken: booking.teacher_daily_token ?? undefined,
          studentToken: booking.student_daily_token ?? undefined,
          expiresAt: booking.daily_room_expires_at ?? undefined,
        };
      }

      // Generate room configuration
      const { roomName, roomExpiration } = this.generateRoomConfig(booking);

      // Create Daily.co room
      const dailyRoom = await this.createDailyRoom(roomName, roomExpiration);

      // Generate secure tokens for teacher and student
      const tokens = await this.generateTokensForBooking(booking, roomName, roomExpiration);

      // Update database with room details
      await this.updateBookingWithRoomDetails(bookingId, dailyRoom, tokens, roomExpiration);

      console.log(`✅ Video room created successfully for booking: ${bookingId}`);

      return {
        success: true,
        roomName: dailyRoom.name,
        roomUrl: dailyRoom.url,
        teacherToken: tokens.teacherToken,
        studentToken: tokens.studentToken,
        expiresAt: new Date(roomExpiration * 1000).toISOString(),
      };

    } catch (error) {
      console.error(`❌ Error creating video room for booking ${bookingId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Generate new access tokens for an existing room
   */
  async generateTokensForRoom(bookingId: string): Promise<{ teacherToken: string; studentToken: string }> {
    const booking = await this.getBookingDetails(bookingId);

    if (!booking.daily_room_name) {
      throw new Error('No video room exists for this booking');
    }

    const roomExpiration = booking.daily_room_expires_at
      ? Math.floor(new Date(booking.daily_room_expires_at).getTime() / 1000)
      : Math.floor(Date.now() / 1000) + (2 * 60 * 60); // 2 hours fallback

    const tokens = await this.generateTokensForBooking(booking, booking.daily_room_name, roomExpiration);

    // Update tokens in database
    await sql`
      UPDATE lesson_bookings
      SET
        teacher_daily_token = ${tokens.teacherToken},
        student_daily_token = ${tokens.studentToken},
        updated_at = NOW()
      WHERE id = ${bookingId}
    `;

    return tokens;
  }

  /**
   * Mark video session as started
   */
  async startSession(bookingId: string, userRole: 'teacher' | 'student'): Promise<void> {
    const now = new Date().toISOString();

    // Check if this is the first person to join (start the session)
    const booking = await queryOne<BookingSession>`
      SELECT session_started_at, teacher_joined_at, student_joined_at
      FROM lesson_bookings
      WHERE id = ${bookingId}
    `;

    if (userRole === 'teacher') {
      if (booking && !booking.session_started_at) {
        await sql`
          UPDATE lesson_bookings
          SET
            teacher_joined_at = ${now},
            session_started_at = ${now},
            updated_at = ${now}
          WHERE id = ${bookingId}
        `;
      } else {
        await sql`
          UPDATE lesson_bookings
          SET
            teacher_joined_at = ${now},
            updated_at = ${now}
          WHERE id = ${bookingId}
        `;
      }
    } else {
      if (booking && !booking.session_started_at) {
        await sql`
          UPDATE lesson_bookings
          SET
            student_joined_at = ${now},
            session_started_at = ${now},
            updated_at = ${now}
          WHERE id = ${bookingId}
        `;
      } else {
        await sql`
          UPDATE lesson_bookings
          SET
            student_joined_at = ${now},
            updated_at = ${now}
          WHERE id = ${bookingId}
        `;
      }
    }

    console.log(`📹 ${userRole} joined video session for booking: ${bookingId}`);
  }

  /**
   * Mark video session as ended
   */
  async endSession(bookingId: string): Promise<void> {
    const now = new Date().toISOString();

    await sql`
      UPDATE lesson_bookings
      SET
        session_ended_at = ${now},
        updated_at = ${now}
      WHERE id = ${bookingId}
    `;

    console.log(`⏹️ Video session ended for booking: ${bookingId}`);
  }

  /**
   * Clean up expired rooms
   */
  async cleanupExpiredRooms(): Promise<void> {
    const expiredBookings = await query<ExpiredBooking>`
      SELECT id, daily_room_name
      FROM lesson_bookings
      WHERE daily_room_expires_at < NOW()
        AND daily_room_name IS NOT NULL
    `;

    if (expiredBookings.length > 0) {
      console.log(`🧹 Cleaning up ${expiredBookings.length} expired video rooms`);

      for (const booking of expiredBookings) {
        try {
          if (booking.daily_room_name) {
            await this.deleteDailyRoom(booking.daily_room_name);
          }

          await sql`
            UPDATE lesson_bookings
            SET
              daily_room_name = NULL,
              daily_room_url = NULL,
              teacher_daily_token = NULL,
              student_daily_token = NULL,
              updated_at = NOW()
            WHERE id = ${booking.id}
          `;

        } catch (error) {
          console.error(`Error cleaning up room for booking ${booking.id}:`, error);
        }
      }
    }
  }

  // Private helper methods

  private async getBookingDetails(bookingId: string): Promise<BookingDetails> {
    const booking = await queryOne<BookingDetails>`
      SELECT
        lb.id,
        lb.private_lesson_id,
        lb.student_id,
        lb.student_name,
        lb.community_id,
        lb.payment_status,
        lb.scheduled_at,
        lb.daily_room_name,
        lb.daily_room_url,
        lb.daily_room_expires_at,
        lb.teacher_daily_token,
        lb.student_daily_token,
        pl.title as lesson_title,
        pl.duration_minutes as lesson_duration_minutes,
        pl.location_type as lesson_location_type,
        pl.teacher_id as lesson_teacher_id,
        c.slug as community_slug,
        c.created_by as community_created_by
      FROM lesson_bookings lb
      INNER JOIN private_lessons pl ON pl.id = lb.private_lesson_id
      INNER JOIN communities c ON c.id = pl.community_id
      WHERE lb.id = ${bookingId}
    `;

    if (!booking) {
      throw new Error(`Booking not found: ${bookingId}`);
    }

    return booking;
  }

  private validateBookingForVideo(booking: BookingDetails): void {
    if (booking.payment_status !== 'succeeded') {
      throw new Error('Payment not completed');
    }

    if (booking.lesson_location_type !== 'online' && booking.lesson_location_type !== 'both') {
      throw new Error('Video room not needed for in-person only lessons');
    }
  }

  private generateRoomConfig(booking: BookingDetails): { roomName: string; roomExpiration: number } {
    // Generate unique room name - ensure it meets Daily.co requirements
    // Room names must be alphanumeric with dashes/underscores, max 128 chars
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const shortBookingId = booking.id.substring(0, 8);
    const sanitizedSlug = booking.community_slug.replace(/[^a-zA-Z0-9-_]/g, '').substring(0, 20);
    const roomName = `${sanitizedSlug}-${shortBookingId}-${randomSuffix}`.toLowerCase();

    console.log('🏠 Generated room name:', roomName);

    // Calculate expiration time
    const bufferMinutes = 30;
    const totalMinutes = booking.lesson_duration_minutes + bufferMinutes;

    let roomExpiration: number;
    if (booking.scheduled_at) {
      const scheduledTime = new Date(booking.scheduled_at).getTime() / 1000;
      roomExpiration = scheduledTime + (totalMinutes * 60);
    } else {
      roomExpiration = Math.floor(Date.now() / 1000) + (totalMinutes * 60);
    }

    // Ensure expiration is in the future
    const now = Math.floor(Date.now() / 1000);
    if (roomExpiration <= now) {
      roomExpiration = now + (2 * 60 * 60); // 2 hours from now as fallback
    }

    console.log('⏰ Room expires at:', new Date(roomExpiration * 1000).toISOString());

    return { roomName, roomExpiration };
  }

  private async createDailyRoom(roomName: string, expiration: number) {
    if (!DAILY_API_KEY) {
      throw new Error('Daily.co API key is not configured');
    }

    // Validate API key format (should start with a specific pattern)
    if (!DAILY_API_KEY.match(/^[a-f0-9-]{36,}$/i) && !DAILY_API_KEY.startsWith('sk_')) {
      console.warn('⚠️ Daily.co API key format might be invalid');
    }

    const roomConfig: DailyRoomConfig = {
      name: roomName,
      privacy: 'private',
      properties: {
        max_participants: 2,
        exp: expiration,
        eject_at_room_exp: true,
        enable_chat: true,
        enable_screenshare: true,
        enable_recording: 'cloud', // This enables recording capability
        owner_only_broadcast: false,
        enable_knocking: false, // Disable knocking for smoother experience
        lang: 'en',
      },
    };

    console.log('🎬 Creating Daily.co room with config:', {
      name: roomConfig.name,
      privacy: roomConfig.privacy,
      max_participants: roomConfig.properties?.max_participants,
      expires_at: new Date(expiration * 1000).toISOString(),
    });

    const response = await this.makeApiRequest(`${DAILY_API_URL}/rooms`, 'POST', roomConfig);
    return response;
  }

  private async generateTokensForBooking(booking: BookingDetails, roomName: string, expiration: number) {
    // Generate teacher token (owner privileges)
    const teacherTokenConfig: DailyMeetingToken = {
      room_name: roomName,
      user_name: 'Teacher',
      user_id: booking.lesson_teacher_id,
      is_owner: true,
      exp: expiration,
      enable_screenshare: true,
    };

    // Generate student token (participant privileges)
    const studentTokenConfig: DailyMeetingToken = {
      room_name: roomName,
      user_name: booking.student_name || 'Student',
      user_id: booking.student_id,
      is_owner: false,
      exp: expiration,
      enable_screenshare: false,
    };

    const [teacherResponse, studentResponse] = await Promise.all([
      this.createMeetingToken(teacherTokenConfig),
      this.createMeetingToken(studentTokenConfig)
    ]);

    return {
      teacherToken: teacherResponse.token,
      studentToken: studentResponse.token,
    };
  }

  private async createMeetingToken(tokenConfig: DailyMeetingToken) {
    const requestBody = { properties: tokenConfig };
    return this.makeApiRequest(`${DAILY_API_URL}/meeting-tokens`, 'POST', requestBody);
  }

  private async deleteDailyRoom(roomName: string) {
    return this.makeApiRequest(`${DAILY_API_URL}/rooms/${roomName}`, 'DELETE');
  }

  private async updateBookingWithRoomDetails(
    bookingId: string,
    dailyRoom: any,
    tokens: { teacherToken: string; studentToken: string },
    expiration: number
  ) {
    const expiresAt = new Date(expiration * 1000).toISOString();
    const now = new Date().toISOString();

    await sql`
      UPDATE lesson_bookings
      SET
        daily_room_name = ${dailyRoom.name},
        daily_room_url = ${dailyRoom.url},
        daily_room_created_at = ${now},
        daily_room_expires_at = ${expiresAt},
        teacher_daily_token = ${tokens.teacherToken},
        student_daily_token = ${tokens.studentToken},
        updated_at = ${now}
      WHERE id = ${bookingId}
    `;
  }

  private async makeApiRequest(url: string, method: 'GET' | 'POST' | 'DELETE', body?: any, retries = 2) {
    if (!DAILY_API_KEY) {
      throw new Error('Daily.co API key is not configured');
    }

    console.log(`📡 Daily.co API Request: ${method} ${url}`);
    if (body) {
      console.log('📡 Request body:', JSON.stringify(body, null, 2));
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const options: RequestInit = {
          method,
          headers: {
            'Authorization': `Bearer ${DAILY_API_KEY}`,
            ...(body && { 'Content-Type': 'application/json' }),
          },
          ...(body && { body: JSON.stringify(body) }),
        };

        const response = await fetch(url, options);

        console.log(`📡 Daily.co API Response: ${response.status} ${response.statusText}`);

        if (!response.ok) {
          const errorText = await response.text();
          let errorDetail;

          try {
            errorDetail = JSON.parse(errorText);
          } catch {
            errorDetail = { error: errorText };
          }

          console.error('📡 Daily.co API Error Response:', {
            status: response.status,
            statusText: response.statusText,
            error: errorDetail,
            url,
            method,
            body
          });

          throw new Error(`Daily.co API error (${response.status}): ${errorDetail.error || errorDetail.message || errorText || 'Request failed'}`);
        }

        const result = method === 'DELETE' ? {} : await response.json();
        console.log('📡 Daily.co API Success:', result);
        return result;

      } catch (error) {
        if (attempt === retries) {
          console.error(`Daily.co API request failed after ${retries + 1} attempts:`, error);
          throw error;
        }
        console.warn(`Daily.co API attempt ${attempt + 1} failed, retrying...`, error);
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Exponential backoff
      }
    }
  }

  // Live Class Methods

  /**
   * Create a Daily.co room for a live class
   */
  async createRoomForLiveClass(classId: string): Promise<VideoRoomResult> {
    try {
      console.log(`🎬 Creating video room for live class ${classId}...`);

      const liveClass = await this.getLiveClassDetails(classId);
      if (!liveClass) {
        return { success: false, error: 'Live class not found' };
      }

      const { roomName, roomExpiration } = this.generateLiveClassRoom(liveClass);

      console.log(`🎬 Generated room name: ${roomName}`);

      const dailyRoom = await this.createDailyRoomForLiveClass(roomName, roomExpiration);

      await this.updateLiveClassWithRoomDetails(classId, dailyRoom, roomExpiration);

      console.log(`✅ Successfully created video room for live class ${classId}`);
      return {
        success: true,
        roomName: dailyRoom.name,
        roomUrl: dailyRoom.url
      };
    } catch (error) {
      console.error(`❌ Failed to create video room for live class ${classId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Generate tokens for a live class room
   */
  async generateTokensForLiveClass(
    classId: string,
    userId: string,
    isTeacher: boolean = false,
    userName?: string
  ): Promise<{ token: string; expires: number } | null> {
    try {
      const liveClass = await this.getLiveClassDetails(classId);
      if (!liveClass || !liveClass.daily_room_name) {
        console.error('Live class or room not found');
        return null;
      }

      const expiration = Math.floor(Date.now() / 1000) + (4 * 60 * 60); // 4 hours

      const tokenConfig: DailyMeetingToken = {
        room_name: liveClass.daily_room_name,
        user_name: userName || (isTeacher ? 'Teacher' : 'Student'),
        user_id: userId,
        is_owner: isTeacher,
        exp: expiration,
        enable_screenshare: isTeacher,
        start_video_off: !isTeacher,
        start_audio_off: !isTeacher,
        permissions: isTeacher
          ? { canSend: true, canAdmin: ['participants'] }
          : { canSend: false },
      };

      const response = await this.createMeetingToken(tokenConfig);
      return {
        token: response.token,
        expires: expiration,
      };
    } catch (error) {
      console.error('Error generating live class tokens:', error);
      return null;
    }
  }

  private async getLiveClassDetails(classId: string): Promise<LiveClassDetails | null> {
    const liveClass = await queryOne<LiveClassDetails>`
      SELECT
        id,
        title,
        description,
        scheduled_start_time,
        duration_minutes,
        daily_room_name,
        daily_room_url,
        daily_room_expires_at,
        community_id,
        teacher_id as created_by
      FROM live_classes
      WHERE id = ${classId}
    `;

    if (!liveClass) {
      console.error(`Live class ${classId} not found`);
      return null;
    }

    return liveClass;
  }

  private generateLiveClassRoom(liveClass: LiveClassDetails): { roomName: string; roomExpiration: number } {
    const roomName = `live-class-${liveClass.id.replace(/-/g, '')}`;

    // Calculate room expiration (class time + duration + 30 minute buffer)
    const classStart = new Date(liveClass.scheduled_start_time).getTime() / 1000;
    const bufferMinutes = 30;
    const totalMinutes = liveClass.duration_minutes + bufferMinutes;
    const roomExpiration = classStart + (totalMinutes * 60);

    // Ensure expiration is in the future
    const now = Math.floor(Date.now() / 1000);
    const finalExpiration = Math.max(roomExpiration, now + (2 * 60 * 60)); // At least 2 hours from now

    console.log('⏰ Live class room expires at:', new Date(finalExpiration * 1000).toISOString());

    return { roomName, roomExpiration: finalExpiration };
  }

  private async createDailyRoomForLiveClass(roomName: string, expiration: number) {
    const roomConfig: DailyRoomConfig = {
      name: roomName,
      privacy: 'private',
      properties: {
        max_participants: 50, // Support larger groups for live classes
        exp: expiration,
        eject_at_room_exp: true,
        enable_chat: true,
        enable_screenshare: true,
        enable_recording: 'cloud',
        owner_only_broadcast: false,
        enable_knocking: false,
        lang: 'en',
      },
    };

    console.log('🎬 Creating Daily.co live class room with config:', {
      name: roomConfig.name,
      privacy: roomConfig.privacy,
      max_participants: roomConfig.properties?.max_participants,
      expires_at: new Date(expiration * 1000).toISOString(),
    });

    return this.makeApiRequest(`${DAILY_API_URL}/rooms`, 'POST', roomConfig);
  }

  private async updateLiveClassWithRoomDetails(
    classId: string,
    dailyRoom: any,
    expiration: number
  ) {
    const expiresAt = new Date(expiration * 1000).toISOString();
    const now = new Date().toISOString();

    await sql`
      UPDATE live_classes
      SET
        daily_room_name = ${dailyRoom.name},
        daily_room_url = ${dailyRoom.url},
        daily_room_expires_at = ${expiresAt},
        updated_at = ${now}
      WHERE id = ${classId}
    `;
  }
}

// Export singleton instance
export const videoRoomService = new VideoRoomService();
