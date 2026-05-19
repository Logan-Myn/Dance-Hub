"use client";

import React, { useState, Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { cn } from '@/lib/utils';
import { LessonsTab } from './LessonsTab';
import { BookingsTab } from './BookingsTab';
import { AvailabilityTab } from './AvailabilityTab';

interface PrivateLessonManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  communityId: string;
  communitySlug: string;
  /** Fires after lessons change so the parent page can refresh its grid. */
  onLessonsChanged?: () => void;
}

type TabKey = 'lessons' | 'bookings' | 'availability';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'lessons', label: 'Lessons' },
  { key: 'bookings', label: 'Bookings' },
  { key: 'availability', label: 'Availability' },
];

export default function PrivateLessonManagementModal({
  isOpen,
  onClose,
  communityId,
  communitySlug,
  onLessonsChanged,
}: PrivateLessonManagementModalProps) {
  const [active, setActive] = useState<TabKey>('lessons');

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-2 sm:p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-5xl h-[85vh] bg-background rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
                  <Dialog.Title className="font-display text-lg font-semibold">
                    Manage Private Lessons
                  </Dialog.Title>
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="rounded-md p-1 hover:bg-muted text-muted-foreground"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                <div className="px-5 border-b border-border/50">
                  <nav className="flex gap-1 -mb-px">
                    {TABS.map(tab => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActive(tab.key)}
                        className={cn(
                          'px-3 py-2.5 text-sm font-medium border-b-2 transition-colors',
                          active === tab.key
                            ? 'border-primary text-foreground'
                            : 'border-transparent text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </nav>
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                  {active === 'lessons' && (
                    <LessonsTab
                      communityId={communityId}
                      communitySlug={communitySlug}
                      onLessonsChanged={onLessonsChanged}
                    />
                  )}
                  {active === 'bookings' && (
                    <BookingsTab communitySlug={communitySlug} />
                  )}
                  {active === 'availability' && (
                    <AvailabilityTab communitySlug={communitySlug} />
                  )}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
