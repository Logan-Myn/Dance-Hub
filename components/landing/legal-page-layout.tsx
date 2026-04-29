import { ReactNode } from "react";
import Link from "next/link";
import Navbar from "@/app/components/Navbar";
import { Footer } from "@/components/landing/footer";
import { ArrowLeft, Mail, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth-session";
import { getProfileForUser } from "@/lib/community-data";

const SUPPORT_EMAIL = "support@dance-hub.io";

interface LegalPageLayoutProps {
  title: string;
  icon: LucideIcon;
  lastUpdated: string;
  children: ReactNode;
}

export async function LegalPageLayout({
  title,
  icon: Icon,
  lastUpdated,
  children,
}: LegalPageLayoutProps) {
  const session = await getSession();
  const profile = session ? await getProfileForUser(session.user.id) : null;

  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-neutral-950">
      <Navbar initialUser={session?.user ?? null} initialProfile={profile} />

      <main className="flex-grow">
        <section className="relative overflow-hidden bg-gradient-to-b from-violet-50 via-white to-white dark:from-neutral-900 dark:via-neutral-950 dark:to-neutral-950">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(139,92,246,0.1),transparent_50%)] pointer-events-none" />
          <div className="container mx-auto px-4 py-16 md:py-24">
            <div className="max-w-3xl mx-auto">
              <Button variant="ghost" size="sm" asChild className="mb-6">
                <Link href="/" className="text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Home
                </Link>
              </Button>
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center">
                  <Icon className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h1 className="text-4xl md:text-5xl font-bold text-neutral-900 dark:text-white">
                    {title}
                  </h1>
                  <p className="text-muted-foreground mt-1">Last updated: {lastUpdated}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-12 md:py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto prose prose-neutral dark:prose-invert prose-headings:font-semibold prose-h2:text-2xl prose-h2:mt-12 prose-h2:mb-4 prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3 prose-p:text-neutral-600 dark:prose-p:text-neutral-400 prose-li:text-neutral-600 dark:prose-li:text-neutral-400">
              {children}
              <div className="not-prose mt-6 p-6 rounded-2xl bg-gradient-to-b from-neutral-50 to-white dark:from-neutral-900 dark:to-neutral-950 border border-neutral-200 dark:border-neutral-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center">
                    <Mail className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-medium text-neutral-900 dark:text-white">Email Us</p>
                    <a
                      href={`mailto:${SUPPORT_EMAIL}`}
                      className="text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300"
                    >
                      {SUPPORT_EMAIL}
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
