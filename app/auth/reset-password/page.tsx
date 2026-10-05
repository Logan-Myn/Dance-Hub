import Link from "next/link";
import ResetPasswordForm from "./ResetPasswordForm";

interface ResetPasswordPageProps {
  searchParams: Promise<{ token?: string | string[]; error?: string | string[] }>;
}

/**
 * Where the reset email lands. The auth server checks the link first and
 * sends back either ?token= or ?error=INVALID_TOKEN (expired or already used).
 */
export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const { token, error } = await searchParams;
  const usableToken = typeof token === "string" && token && !error ? token : null;

  return (
    <main className="flex min-h-[100dvh] flex-col items-center bg-canvas px-4 py-8 sm:justify-center sm:py-12">
      <Link href="/" aria-label="Dance-Hub home" className="inline-flex items-center gap-2.5 font-display text-[17px] font-semibold text-ink">
        <span aria-hidden="true" className="grid h-[30px] w-[30px] place-items-center rounded-lg bg-brand text-[13px] font-bold tracking-tight text-white">
          DH
        </span>
        Dance-Hub
      </Link>
      <div className="mt-6 w-full max-w-[440px] rounded-[20px] border border-line bg-surface p-6 shadow-raised sm:p-8">
        <ResetPasswordForm token={usableToken} />
      </div>
    </main>
  );
}
