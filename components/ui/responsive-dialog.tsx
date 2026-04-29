'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-is-mobile';

type CommonProps = {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
};

const ResponsiveDialogContext = React.createContext(false);

export function ResponsiveDialog(props: CommonProps) {
  const isMobile = useIsMobile();
  const Wrapper = isMobile ? Sheet : Dialog;
  return (
    <ResponsiveDialogContext.Provider value={isMobile}>
      <Wrapper {...props} />
    </ResponsiveDialogContext.Provider>
  );
}

export function ResponsiveDialogTrigger({
  children,
  asChild,
}: {
  children: React.ReactNode;
  asChild?: boolean;
}) {
  const isMobile = React.useContext(ResponsiveDialogContext);
  return isMobile ? (
    <SheetTrigger asChild={asChild}>{children}</SheetTrigger>
  ) : (
    <DialogTrigger asChild={asChild}>{children}</DialogTrigger>
  );
}

export function ResponsiveDialogContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const isMobile = React.useContext(ResponsiveDialogContext);
  if (isMobile) {
    return (
      <SheetContent
        side="bottom"
        className={`max-h-[90vh] overflow-y-auto rounded-t-2xl pb-safe ${className ?? ''}`.trim()}
      >
        {children}
      </SheetContent>
    );
  }
  return <DialogContent className={className}>{children}</DialogContent>;
}

export function ResponsiveDialogHeader({ children }: { children: React.ReactNode }) {
  const isMobile = React.useContext(ResponsiveDialogContext);
  return isMobile ? <SheetHeader>{children}</SheetHeader> : <DialogHeader>{children}</DialogHeader>;
}

export function ResponsiveDialogFooter({ children }: { children: React.ReactNode }) {
  const isMobile = React.useContext(ResponsiveDialogContext);
  return isMobile ? <SheetFooter>{children}</SheetFooter> : <DialogFooter>{children}</DialogFooter>;
}

export function ResponsiveDialogTitle({ children }: { children: React.ReactNode }) {
  const isMobile = React.useContext(ResponsiveDialogContext);
  return isMobile ? <SheetTitle>{children}</SheetTitle> : <DialogTitle>{children}</DialogTitle>;
}

export function ResponsiveDialogDescription({ children }: { children: React.ReactNode }) {
  const isMobile = React.useContext(ResponsiveDialogContext);
  return isMobile ? (
    <SheetDescription>{children}</SheetDescription>
  ) : (
    <DialogDescription>{children}</DialogDescription>
  );
}
