"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import AuthModal, { type AuthModalTab } from "@/components/auth/AuthModal";

interface AuthModalContextType {
  showAuthModal: (tab: AuthModalTab, redirectUrl?: string) => void;
}

const AuthModalContext = createContext<AuthModalContextType | undefined>(undefined);

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [initialTab, setInitialTab] = useState<AuthModalTab>("signin");
  const [redirectUrl, setRedirectUrl] = useState<string | undefined>(undefined);

  const showAuthModal = (tab: AuthModalTab, redirectUrl?: string) => {
    setInitialTab(tab);
    setRedirectUrl(redirectUrl);
    setIsOpen(true);
  };

  return (
    <AuthModalContext.Provider value={{ showAuthModal }}>
      {children}
      <AuthModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        initialTab={initialTab}
        redirectUrl={redirectUrl}
      />
    </AuthModalContext.Provider>
  );
}

export function useAuthModal() {
  const context = useContext(AuthModalContext);
  if (context === undefined) {
    throw new Error("useAuthModal must be used within an AuthModalProvider");
  }
  return context;
} 