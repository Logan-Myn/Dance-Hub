# DanceHub v3 🕺💃

A modern platform for dance communities with private lessons, courses, and integrated video calling.

## ✨ Features

- **Community Management**: Create and manage dance communities
- **Private Lessons**: Book 1:1 sessions with instructors
- **Video Integration**: In-app video calls powered by Daily.co
- **Course System**: Create and sell dance courses
- **Payment Processing**: Secure payments via Stripe
- **Real-time Communication**: Threads and notifications
- **Responsive Design**: Works on desktop and mobile

## 🎥 Video Calling Integration

This project includes a complete Daily.co integration for private teacher-student lessons:

- **Automatic Room Creation**: Video rooms created on booking
- **Secure Access**: Token-based authentication
- **In-app Experience**: No external redirects needed
- **Teacher Controls**: Recording, screen sharing, participant management
- **Mobile Support**: Works on all devices

See [Daily.co Setup Guide](./docs/daily-co-setup.md) for detailed setup instructions.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL database (or Supabase)
- Stripe account for payments
- Daily.co account for video calling

### Environment Variables

Create a `.env.local` file with the following variables:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Stripe
STRIPE_SECRET_KEY=your_stripe_secret_key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key

# Daily.co Video Calling
DAILY_API_KEY=your_daily_co_api_key

# App Configuration
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/dancehub-v3.git
cd dancehub-v3
```

2. Install dependencies:
```bash
npm install
```

3. Set up the database:
```bash
# Run Supabase migrations
npx supabase db push

# Or run the SQL migration manually
psql -d your_database -f supabase/migrations/add_daily_co_fields.sql
```

4. Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## 📱 User Flows

### For Students:
1. **Browse Communities**: Discover dance communities and instructors
2. **Book Lessons**: Choose and book private lessons with payment
3. **Join Video Sessions**: Access in-app video calls for lessons
4. **Track Progress**: View lesson history and upcoming sessions

### For Teachers:
1. **Create Communities**: Set up your dance community
2. **Offer Lessons**: Create private lesson offerings
3. **Teach Online**: Use integrated video calling with recording
4. **Manage Students**: Handle bookings and communications

## 🏗️ Architecture

### Tech Stack
- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Supabase
- **Database**: PostgreSQL (via Supabase)
- **Authentication**: Supabase Auth
- **Payments**: Stripe Connect
- **Video**: Daily.co
- **Deployment**: Vercel

### Key Components
- `VideoCall`: Daily.co video integration component
- `VideoSessionPage`: Full-page video session interface
- `MyBookedLessons`: Student dashboard for lesson management
- `PrivateLessonsPage`: Lesson browsing and booking

## 🔧 Development

### Project Structure
```
├── app/                    # Next.js 14 App Router
│   ├── api/               # API routes
│   ├── [communitySlug]/   # Dynamic community pages
│   └── video-session/     # Video session pages
├── components/            # React components
│   ├── ui/               # Reusable UI components
│   └── VideoCall.tsx     # Daily.co integration
├── lib/                  # Utility libraries
│   ├── daily.ts          # Daily.co API helpers
│   └── video-notifications.ts # Notification system
├── docs/                 # Documentation
└── supabase/            # Database migrations
```

### Key Features Implementation

#### Video Integration
- **Room Creation**: Automatic Daily.co room setup on booking
- **Token Management**: Secure access tokens for participants
- **Session Lifecycle**: Start, manage, and end video sessions
- **Recording**: Teacher-controlled cloud recording

#### Booking System
- **Payment Flow**: Stripe integration with community payouts
- **Access Control**: Secure video room access verification
- **Scheduling**: Time-based lesson management
- **Notifications**: Email and in-app notifications

## 🔐 Security

- **Authentication**: Supabase Auth with Row Level Security
- **Video Access**: Time-limited tokens with participant verification
- **Payment Security**: Stripe's secure payment processing
- **Data Protection**: Encrypted database connections

## 📚 API Documentation

### Video Session APIs
- `POST /api/bookings/[id]/video-token` - Generate video access tokens
- `POST /api/community/[slug]/private-lessons/[id]/book` - Book lesson with video room

### Webhook Endpoints
- `POST /api/stripe/webhook` - Handle payment confirmations
- `POST /api/daily/webhook` - Handle video session events (optional)

## 🚀 Deployment

### Vercel Deployment
1. Connect your GitHub repository to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Database Setup
1. Set up Supabase project
2. Run migrations: `npx supabase db push`
3. Enable Row Level Security policies

### Daily.co Setup
1. Create Daily.co account
2. Get API key from dashboard
3. Configure domain settings (optional)

## 🧪 Testing

### Test Video Integration
1. Create a test community and private lesson
2. Book the lesson as a different user
3. Complete payment flow
4. Test video session from both teacher and student accounts
5. Verify recording functionality

### Load Testing
```bash
# Install load testing dependencies
npm install --save-dev artillery

# Run video session load tests
npm run test:load
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📖 Documentation

- [Daily.co Integration Guide](./docs/daily-co-integration.md)
- [API Testing Guide](./docs/archive/API_TESTING_GUIDE.md)
- [Business Model](./BusinessModel.md)

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For issues and questions:
- Check the [Daily.co Integration Guide](./docs/daily-co-integration.md)
- Review API endpoints and error handling
- Open an issue on GitHub

---

Built with ❤️ for the dance community

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
