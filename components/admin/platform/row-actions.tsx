'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ExternalLink, MoreHorizontal, Pencil, Trash2, type LucideIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ICON_BTN, MENU_ITEM, MENU_SEP, POP } from '@/components/community-shell/menu-styles';
import { communityPath } from '@/lib/safe-redirect';
import { cn } from '@/lib/utils';
import { ConfirmDialog, EditDialog, adminRequest } from './dialogs';

type Entry =
  | { kind: 'link'; label: string; icon: LucideIcon; href: string }
  | { kind: 'action'; label: string; icon: LucideIcon; onSelect: () => void; danger?: boolean };

/** The "⋯" menu at the end of a row. Its windows live outside the menu, so closing the menu never closes them. */
function RowMenu({ label, entries }: { label: string; entries: Entry[] }) {
  const firstDanger = entries.findIndex((e) => e.kind === 'action' && e.danger);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger aria-label={label} className={cn(ICON_BTN, 'h-8 w-8')}>
        <MoreHorizontal className="h-[18px] w-[18px]" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className={cn(POP, 'w-52')}>
        {entries.map((e, i) => (
          <div key={e.label}>
            {i === firstDanger && i > 0 && <DropdownMenuSeparator className={MENU_SEP} />}
            {e.kind === 'link' ? (
              <DropdownMenuItem asChild className={MENU_ITEM}>
                <a href={e.href} target="_blank" rel="noopener noreferrer">
                  <e.icon aria-hidden="true" />
                  {e.label}
                </a>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={e.onSelect} className={cn(MENU_ITEM, e.danger && 'text-live [&>svg]:text-live')}>
                <e.icon aria-hidden="true" />
                {e.label}
              </DropdownMenuItem>
            )}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type Open = 'edit' | 'delete' | null;

export function CommunityActions({
  community,
}: {
  community: { id: string; name: string; slug: string; description: string | null };
}) {
  const [open, setOpen] = useState<Open>(null);
  const router = useRouter();
  const url = `/api/admin/communities/${community.id}`;
  return (
    <>
      <RowMenu
        label={`Actions for ${community.name}`}
        entries={[
          { kind: 'link', label: 'Open community', icon: ExternalLink, href: communityPath(community.slug) },
          { kind: 'action', label: 'Edit details', icon: Pencil, onSelect: () => setOpen('edit') },
          { kind: 'action', label: 'Delete community', icon: Trash2, onSelect: () => setOpen('delete'), danger: true },
        ]}
      />
      <EditDialog
        open={open === 'edit'}
        onOpenChange={(o) => setOpen(o ? 'edit' : null)}
        title="Edit community"
        fields={[
          { key: 'name', label: 'Name', value: community.name, required: true },
          { key: 'slug', label: 'Web address', value: community.slug, required: true, help: `dance-hub.io/${community.slug}. Changing it breaks links people already have.` },
          { key: 'description', label: 'Description', value: community.description ?? '', multiline: true },
        ]}
        onSave={async (v) => {
          await adminRequest(url, 'PATCH', { name: v.name, slug: v.slug, description: v.description });
          toast.success('Community updated');
          router.refresh();
        }}
      />
      <ConfirmDialog
        open={open === 'delete'}
        onOpenChange={(o) => setOpen(o ? 'delete' : null)}
        title="Delete this community?"
        confirmLabel="Delete community"
        typeToConfirm={community.name}
        onConfirm={async () => {
          await adminRequest(url, 'DELETE');
          toast.success('Community deleted');
          router.refresh();
        }}
      >
        <p>
          Every member subscription to <span className="font-semibold text-ink">{community.name}</span>{' '}
          is cancelled, and its members, posts, courses and classes are removed. This can&apos;t be undone.
        </p>
      </ConfirmDialog>
    </>
  );
}

export function UserActions({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState<Open>(null);
  const [profile, setProfile] = useState<{ full_name: string; display_name: string; email: string } | null>(null);
  const router = useRouter();
  const url = `/api/admin/users/${userId}`;

  const startEdit = async () => {
    setProfile(null);
    setOpen('edit');
    try {
      const res = await fetch(`/api/profile?userId=${encodeURIComponent(userId)}`);
      if (!res.ok) throw new Error();
      const p = await res.json();
      setProfile({ full_name: p.full_name ?? '', display_name: p.display_name ?? '', email: p.email ?? '' });
    } catch {
      toast.error("Couldn't load this user. Try again.");
      setOpen(null);
    }
  };

  return (
    <>
      <RowMenu
        label={`Actions for ${name}`}
        entries={[
          { kind: 'action', label: 'Edit user', icon: Pencil, onSelect: startEdit },
          { kind: 'action', label: 'Delete user', icon: Trash2, onSelect: () => setOpen('delete'), danger: true },
        ]}
      />
      <EditDialog
        open={open === 'edit'}
        onOpenChange={(o) => setOpen(o ? 'edit' : null)}
        title="Edit user"
        loading={!profile}
        fields={[
          { key: 'full_name', label: 'Full name', value: profile?.full_name ?? '' },
          { key: 'display_name', label: 'Display name', value: profile?.display_name ?? '' },
          { key: 'email', label: 'Email', value: profile?.email ?? '', type: 'email' },
        ]}
        onSave={async (v) => {
          await adminRequest(url, 'PATCH', { full_name: v.full_name, display_name: v.display_name, email: v.email });
          toast.success('User updated');
          router.refresh();
        }}
      />
      <ConfirmDialog
        open={open === 'delete'}
        onOpenChange={(o) => setOpen(o ? 'delete' : null)}
        title="Delete this user?"
        confirmLabel="Delete user"
        onConfirm={async () => {
          await adminRequest(url, 'DELETE');
          toast.success('User deleted');
          router.refresh();
        }}
      >
        <p>
          <span className="font-semibold text-ink">{name}</span>{' '}
          loses their account and everything tied to it. This can&apos;t be undone.
        </p>
      </ConfirmDialog>
    </>
  );
}

export function ThreadActions({ thread }: { thread: { id: string; title: string; communitySlug: string | null } }) {
  const [open, setOpen] = useState<Open>(null);
  const router = useRouter();
  return (
    <>
      <RowMenu
        label={`Actions for ${thread.title}`}
        entries={[
          ...(thread.communitySlug
            ? [{ kind: 'link' as const, label: 'Open post', icon: ExternalLink, href: `${communityPath(thread.communitySlug)}?thread=${thread.id}` }]
            : []),
          { kind: 'action', label: 'Delete post', icon: Trash2, onSelect: () => setOpen('delete'), danger: true },
        ]}
      />
      <ConfirmDialog
        open={open === 'delete'}
        onOpenChange={(o) => setOpen(o ? 'delete' : null)}
        title="Delete this post?"
        confirmLabel="Delete post"
        onConfirm={async () => {
          await adminRequest(`/api/admin/threads/${thread.id}`, 'DELETE');
          toast.success('Post deleted');
          router.refresh();
        }}
      >
        <p>
          <span className="font-semibold text-ink">{thread.title}</span>{' '}
          and its replies go for good. This can&apos;t be undone.
        </p>
      </ConfirmDialog>
    </>
  );
}

export function CourseActions({
  course,
}: {
  course: { id: string; title: string; slug: string; description: string | null; communitySlug: string | null };
}) {
  const [open, setOpen] = useState<Open>(null);
  const router = useRouter();
  const url = `/api/admin/courses/${course.id}`;
  return (
    <>
      <RowMenu
        label={`Actions for ${course.title}`}
        entries={[
          ...(course.communitySlug
            ? [{ kind: 'link' as const, label: 'Open course', icon: ExternalLink, href: communityPath(course.communitySlug, `/classroom/${course.slug}`) }]
            : []),
          { kind: 'action', label: 'Edit course', icon: Pencil, onSelect: () => setOpen('edit') },
          { kind: 'action', label: 'Delete course', icon: Trash2, onSelect: () => setOpen('delete'), danger: true },
        ]}
      />
      <EditDialog
        open={open === 'edit'}
        onOpenChange={(o) => setOpen(o ? 'edit' : null)}
        title="Edit course"
        fields={[
          { key: 'title', label: 'Title', value: course.title, required: true },
          { key: 'description', label: 'Description', value: course.description ?? '', multiline: true },
        ]}
        onSave={async (v) => {
          await adminRequest(url, 'PATCH', { title: v.title, description: v.description });
          toast.success('Course updated');
          router.refresh();
        }}
      />
      <ConfirmDialog
        open={open === 'delete'}
        onOpenChange={(o) => setOpen(o ? 'delete' : null)}
        title="Delete this course?"
        confirmLabel="Delete course"
        onConfirm={async () => {
          await adminRequest(url, 'DELETE');
          toast.success('Course deleted');
          router.refresh();
        }}
      >
        <p>
          <span className="font-semibold text-ink">{course.title}</span>, its chapters, lessons and videos go for
          good. This can&apos;t be undone.
        </p>
      </ConfirmDialog>
    </>
  );
}
