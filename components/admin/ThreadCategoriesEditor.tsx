"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { ArrowDown, ArrowUp, Eye, Lock, Plus, Trash2 } from "lucide-react";
import { BTN_PRIMARY } from "@/components/community-feed/feed-header";
import { Card, Screen, ScreenHead } from "@/components/community-admin/ui";
import { FIELD_INPUT } from "@/components/ds/app-dialog";
import { EmptyState } from "@/components/ds/empty-state";
import { SaveBar } from "@/components/ds/save-bar";
import { Switch } from "@/components/ds/switch";
import { CATEGORY_ICONS } from "@/lib/constants";
import type { ThreadCategory } from "@/types/community";
import { cn } from "@/lib/utils";

const ICON_BTN = "grid h-8 w-8 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-40";

interface ThreadCategoriesEditorProps {
  communitySlug: string;
  initialCategories: ThreadCategory[];
}

/**
 * Post topics. The API replaces the whole `thread_categories` array, so edits
 * stay local until Save; the save bar shows while there are changes.
 */
export function ThreadCategoriesEditor({ communitySlug, initialCategories }: ThreadCategoriesEditorProps) {
  const router = useRouter();
  const [saved, setSaved] = useState<ThreadCategory[]>(initialCategories);
  const [categories, setCategories] = useState<ThreadCategory[]>(initialCategories);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(saved) !== JSON.stringify(categories);

  const add = () => {
    const preset = CATEGORY_ICONS[categories.length % CATEGORY_ICONS.length];
    const id = crypto.randomUUID();
    setCategories([...categories, { id, name: "", iconType: preset.label, color: preset.color }]);
    requestAnimationFrame(() => document.getElementById(`topic-${id}`)?.focus());
  };
  const change = (id: string, patch: Partial<ThreadCategory>) => setCategories(categories.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const move = (i: number, dir: -1 | 1) => {
    const next = [...categories];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setCategories(next);
  };

  const save = async () => {
    if (categories.some((c) => !c.name.trim())) {
      toast.error("Give every topic a name, or delete the empty one.");
      return;
    }
    setSaving(true);
    try {
      const clean = categories.map((c) => ({ ...c, name: c.name.trim() }));
      const response = await fetch(`/api/community/${communitySlug}/categories`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categories: clean }),
      });
      if (!response.ok) throw new Error();
      setSaved(clean);
      setCategories(clean);
      toast.success("Topics saved");
      router.refresh();
    } catch {
      toast.error("Couldn't save the topics. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <ScreenHead
        title="Post topics"
        sub="The topics members pick when they post. Your colors show on every post and filter."
        actions={
          <button type="button" className={BTN_PRIMARY} onClick={add}>
            <Plus aria-hidden="true" />
            Add topic
          </button>
        }
      />
      <div id="settings-thread_categories">
        {categories.length === 0 ? (
          <EmptyState
            icon={<Plus className="h-7 w-7" />}
            title="No topics yet"
            actions={
              <button type="button" className={BTN_PRIMARY} onClick={add}>
                <Plus aria-hidden="true" />
                Add topic
              </button>
            }
          >
            Topics help members find posts, like Questions, Practice clips or Events. Members can still post without one.
          </EmptyState>
        ) : (
          <Card as="section" aria-label="Topics">
            <ul className="divide-y divide-line">
              {categories.map((c, i) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2.5 px-4 py-3 sm:px-5">
                  <input
                    type="color"
                    value={c.color || "#8E57DB"}
                    onChange={(e) => change(c.id, { color: e.target.value })}
                    aria-label={`Color for ${c.name || "this topic"}`}
                    className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-line bg-surface p-1"
                  />
                  <input
                    id={`topic-${c.id}`}
                    value={c.name}
                    onChange={(e) => change(c.id, { name: e.target.value })}
                    placeholder="Topic name"
                    aria-label="Topic name"
                    maxLength={40}
                    className={cn(FIELD_INPUT, "h-9 min-w-[160px] flex-1 py-0")}
                  />
                  <Switch checked={!!c.creatorOnly} onChange={(v) => change(c.id, { creatorOnly: v })} label="Only you can post" />
                  <span className="ml-auto flex items-center">
                    <button type="button" className={ICON_BTN} aria-label={`Move ${c.name || "topic"} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                      <ArrowUp className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button type="button" className={ICON_BTN} aria-label={`Move ${c.name || "topic"} down`} disabled={i === categories.length - 1} onClick={() => move(i, 1)}>
                      <ArrowDown className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={cn(ICON_BTN, "hover:bg-live-soft hover:text-live")}
                      aria-label={`Delete ${c.name || "topic"}`}
                      onClick={() => setCategories(categories.filter((x) => x.id !== c.id))}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-1.5 border-t border-line bg-surface-2 px-5 py-3.5">
              <span className="mr-1 inline-flex w-full items-center gap-1.5 text-[12.5px] font-semibold text-ink-3 sm:w-auto">
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                How members see them
              </span>
              {categories.map((c) => (
                <span key={c.id} className="inline-flex h-[30px] items-center gap-[7px] rounded-full border border-line bg-surface px-[11px] text-[13.5px] font-medium text-ink-2">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color || "#8E57DB" }} />
                  {c.name || "Untitled"}
                  {c.creatorOnly && <Lock className="h-3 w-3 text-ink-3" aria-label="Only you can post" />}
                </span>
              ))}
            </div>
          </Card>
        )}
      </div>
      <p className="text-[13.5px] text-ink-3">Deleting a topic keeps its posts.</p>
      <SaveBar show={dirty} saving={saving} onSave={save} onDiscard={() => setCategories(saved)} saveLabel="Save topics" />
    </Screen>
  );
}
