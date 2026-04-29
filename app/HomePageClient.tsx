"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/landing/footer";
import {
  Users,
  BookOpenText,
  CircleDollarSign,
  Check,
  ArrowRight,
  Sparkles,
  Video,
  Calendar,
  TrendingUp,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";

const features = [
  {
    icon: Users,
    title: "Build Your Community",
    description: "Create a thriving dance community with powerful engagement tools and seamless communication.",
  },
  {
    icon: BookOpenText,
    title: "Course Management",
    description: "Design beautiful courses with our intuitive builder. Upload videos, track progress, and engage students.",
  },
  {
    icon: Video,
    title: "Live Classes",
    description: "Host live video sessions with built-in video conferencing. Connect with students in real-time.",
  },
  {
    icon: Calendar,
    title: "Private Lessons",
    description: "Schedule and manage one-on-one sessions. Automated booking and payment processing.",
  },
  {
    icon: CircleDollarSign,
    title: "Smart Monetization",
    description: "Start with 0% fees for 30 days. Scale with competitive pricing. Keep more of what you earn.",
  },
  {
    icon: TrendingUp,
    title: "Analytics & Insights",
    description: "Track your growth with detailed analytics. Understand your students and optimize your business.",
  },
];

const benefits = [
  "30-day free trial with zero platform fees",
  "Unlimited courses and students",
  "Built-in video hosting and streaming",
  "Secure payment processing with Stripe",
  "24/7 customer support",
];

export default function HomePageClient() {
  const { user } = useAuth();
  const { showAuthModal } = useAuthModal();

  const handleTeachingClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!user) {
      e.preventDefault();
      showAuthModal("signup", "/onboarding");
    }
  };

  return (
    <>
      <main className="flex-grow">
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-gradient-to-b from-violet-50 via-white to-white dark:from-neutral-900 dark:via-neutral-950 dark:to-neutral-950">
          {/* Animated background gradient */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(139,92,246,0.1),transparent_50%)] pointer-events-none"></div>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_60%,rgba(168,85,247,0.08),transparent_50%)] pointer-events-none"></div>

          <div className="container mx-auto px-4 py-24 md:py-32 lg:py-40">
            <div className="max-w-5xl mx-auto text-center">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-2 mb-8 rounded-full bg-violet-100 dark:bg-violet-950/50 border border-violet-200 dark:border-violet-800">
                <Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                <span className="text-sm font-medium text-violet-900 dark:text-violet-100">
                  The all-in-one platform for dance teachers
                </span>
              </div>

              {/* Hero Title */}
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 dark:from-white dark:via-neutral-100 dark:to-white bg-clip-text text-transparent">
                Grow Your Dance
                <br />
                <span className="bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
                  Business Online
                </span>
              </h1>

              {/* Hero Description */}
              <p className="text-lg md:text-xl text-neutral-600 dark:text-neutral-400 max-w-3xl mx-auto mb-12 leading-relaxed">
                Everything you need to build, manage, and monetize your dance community.
                Create courses, host live classes, book private lessons, and grow your revenue.
              </p>

              {/* CTA Button */}
              <div className="flex justify-center">
                <Button
                  size="lg"
                  asChild
                  className="bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white border-0 text-lg px-8 py-6 rounded-xl shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition-all duration-200 hover:scale-105"
                >
                  <Link href="/onboarding" onClick={handleTeachingClick}>
                    Create Your Community
                    <ArrowRight className="ml-2 w-5 h-5" />
                  </Link>
                </Button>
              </div>

              {/* Social Proof */}
              <div className="mt-12 flex flex-wrap justify-center items-center gap-8 text-sm text-neutral-600 dark:text-neutral-400">
                <div className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-600" />
                  <span>Setup in minutes</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-600" />
                  <span>No monthly fees</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-600" />
                  <span>Only pay when you earn</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom gradient fade */}
          <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-white dark:from-neutral-950 to-transparent pointer-events-none"></div>
        </section>

        {/* Features Grid */}
        <section className="py-24 md:py-32 bg-white dark:bg-neutral-950">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center mb-16">
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6 text-neutral-900 dark:text-white">
                Everything you need to succeed
              </h2>
              <p className="text-lg text-neutral-600 dark:text-neutral-400">
                A complete toolkit designed specifically for dance teachers and choreographers
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
              {features.map((feature, index) => (
                <div
                  key={feature.title}
                  className="group relative p-8 rounded-2xl bg-gradient-to-b from-neutral-50 to-white dark:from-neutral-900 dark:to-neutral-950 border border-neutral-200 dark:border-neutral-800 hover:border-violet-200 dark:hover:border-violet-800 transition-all duration-300 hover:shadow-xl hover:shadow-violet-500/10"
                  style={{
                    animationDelay: `${index * 100}ms`,
                  }}
                >
                  <div className="mb-5 w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <feature.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold mb-3 text-neutral-900 dark:text-white">
                    {feature.title}
                  </h3>
                  <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section className="py-24 md:py-32 bg-gradient-to-b from-violet-50 to-white dark:from-neutral-900 dark:to-neutral-950">
          <div className="container mx-auto px-4">
            <div className="max-w-6xl mx-auto">
              <div className="grid lg:grid-cols-2 gap-16 items-center">
                <div>
                  <div className="inline-block px-4 py-2 mb-6 rounded-full bg-violet-100 dark:bg-violet-950/50 border border-violet-200 dark:border-violet-800">
                    <span className="text-sm font-medium text-violet-900 dark:text-violet-100">
                      Why choose DanceHub?
                    </span>
                  </div>
                  <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6 text-neutral-900 dark:text-white">
                    Built for dance teachers, by dancers
                  </h2>
                  <p className="text-lg text-neutral-600 dark:text-neutral-400 mb-8 leading-relaxed">
                    We understand the unique needs of dance education. Our platform is designed
                    to help you focus on what you do best: teaching dance.
                  </p>
                  <ul className="space-y-4">
                    {benefits.map((benefit) => (
                      <li key={benefit} className="flex items-start gap-3">
                        <div className="mt-1 w-5 h-5 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center flex-shrink-0">
                          <Check className="w-3 h-3 text-green-600 dark:text-green-400" />
                        </div>
                        <span className="text-neutral-700 dark:text-neutral-300">
                          {benefit}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-3xl blur-3xl opacity-20"></div>
                  <div className="relative bg-white dark:bg-neutral-900 rounded-3xl border-2 border-neutral-200 dark:border-neutral-800 p-8 shadow-2xl">
                    <div className="space-y-6">
                      <div className="flex items-center justify-between p-4 bg-gradient-to-r from-violet-50 to-fuchsia-50 dark:from-violet-950/30 dark:to-fuchsia-950/30 rounded-xl">
                        <span className="font-semibold text-neutral-900 dark:text-white">
                          Platform Fee
                        </span>
                        <span className="text-2xl font-bold text-violet-600">
                          0%
                        </span>
                      </div>
                      <div className="text-center py-4">
                        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-2">
                          For your first 30 days
                        </p>
                        <p className="text-4xl font-bold text-neutral-900 dark:text-white mb-2">
                          $0
                        </p>
                        <p className="text-sm text-neutral-500 dark:text-neutral-500 mb-4">
                          Then tiered pricing based on growth
                        </p>
                        <div className="space-y-2 text-left">
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-neutral-600 dark:text-neutral-400">Under 50 students</span>
                            <span className="font-semibold text-neutral-900 dark:text-white">8%</span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-neutral-600 dark:text-neutral-400">50-100 students</span>
                            <span className="font-semibold text-neutral-900 dark:text-white">6%</span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-neutral-600 dark:text-neutral-400">100+ students</span>
                            <span className="font-semibold text-neutral-900 dark:text-white">4%</span>
                          </div>
                        </div>
                      </div>
                      <Button
                        asChild
                        className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white border-0 py-6 rounded-xl"
                      >
                        <Link href="/onboarding" onClick={handleTeachingClick}>
                          Create Your Community
                          <ArrowRight className="ml-2 w-5 h-5" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-24 md:py-32 bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10"></div>
          <div className="container mx-auto px-4 relative">
            <div className="max-w-4xl mx-auto text-center">
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6 text-white">
                Ready to transform your dance business?
              </h2>
              <p className="text-lg md:text-xl text-violet-100 mb-12 leading-relaxed">
                Join DanceHub today and start building your community. No credit card required.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  size="lg"
                  asChild
                  className="bg-white hover:bg-neutral-50 text-violet-600 border-0 text-lg px-8 py-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
                >
                  <Link href="/onboarding" onClick={handleTeachingClick}>
                    Create Your Community
                    <ArrowRight className="ml-2 w-5 h-5" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  asChild
                  className="border-2 border-white/30 text-white hover:bg-white/10 backdrop-blur-sm text-lg px-8 py-6 rounded-xl transition-all duration-200"
                >
                  <Link href="/discovery">
                    Explore Communities
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
