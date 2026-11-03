import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { helpPath, preferredHelpLang } from "@/lib/help";

/** /help opens the help center in the visitor's language. */
export default async function HelpRedirect() {
  const lang = preferredHelpLang((await headers()).get("accept-language"));
  redirect(helpPath(lang));
}
