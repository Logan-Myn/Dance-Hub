'use client';

import { useId, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AppDialog, FIELD_INPUT, FIELD_LABEL } from '@/components/ds/app-dialog';
import { BTN_LIVE, BTN_PRIMARY, BTN_SECONDARY } from '@/components/community-feed/feed-header';
import { cn } from '@/lib/utils';

/** Sends a request and throws the server's error message when it fails. */
export async function adminRequest(url: string, method: 'PATCH' | 'DELETE', body?: unknown): Promise<void> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(typeof data?.error === 'string' && data.error ? data.error : 'Something went wrong. Try again.');
  }
}

/**
 * A confirm window for something that can't be undone. With `typeToConfirm`,
 * the button only works once that exact text is typed.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  children,
  confirmLabel,
  typeToConfirm,
  onConfirm,
  returnFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  typeToConfirm?: string;
  onConfirm: () => Promise<void>;
  returnFocus?: React.RefObject<HTMLElement | null>;
}) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const ready = !typeToConfirm || typed.trim() === typeToConfirm.trim();

  // Start clean each time the window opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTyped('');
      setError(null);
    }
  }

  const confirm = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppDialog
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title={title}
      width={460}
      returnFocus={returnFocus}
      footer={
        <>
          <button type="button" className={BTN_SECONDARY} onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={BTN_LIVE} onClick={confirm} disabled={!ready || busy}>
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5 text-[15px] text-ink-2">
        {children}
        {typeToConfirm && (
          <div>
            <label htmlFor={inputId} className={FIELD_LABEL}>
              Type <span className="font-semibold text-ink">{typeToConfirm}</span> to confirm
            </label>
            <input
              id={inputId}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirm()}
              autoComplete="off"
              spellCheck={false}
              className={FIELD_INPUT}
            />
          </div>
        )}
        {error && (
          <p role="alert" className="rounded-[10px] bg-live-soft px-3 py-2.5 text-[13.5px] font-medium text-live">
            {error}
          </p>
        )}
      </div>
    </AppDialog>
  );
}

export interface EditField {
  key: string;
  label: string;
  value: string;
  multiline?: boolean;
  type?: 'text' | 'email';
  required?: boolean;
  help?: string;
}

/** An edit window with a few text fields. `onSave` gets the values by key. */
export function EditDialog({
  open,
  onOpenChange,
  title,
  fields,
  loading,
  onSave,
  returnFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  fields: EditField[];
  /** True while the current values are still loading. */
  loading?: boolean;
  onSave: (values: Record<string, string>) => Promise<void>;
  returnFocus?: React.RefObject<HTMLElement | null>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formId = useId();
  const fieldKey = fields.map((f) => `${f.key}=${f.value}`).join('|');

  // Start from the current values each time the window opens (or they arrive).
  const shownFor = open ? fieldKey : null;
  const [lastShown, setLastShown] = useState<string | null>(null);
  if (shownFor !== lastShown) {
    setLastShown(shownFor);
    if (shownFor !== null) {
      setValues(Object.fromEntries(fields.map((f) => [f.key, f.value])));
      setError(null);
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(values);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppDialog
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title={title}
      width={480}
      returnFocus={returnFocus}
      footer={
        <>
          <button type="button" className={BTN_SECONDARY} onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form={formId} className={BTN_PRIMARY} disabled={busy || loading}>
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </>
      }
    >
      {loading ? (
        <p className="flex items-center gap-2 py-6 text-[14.5px] text-ink-2">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading…
        </p>
      ) : (
        <form id={formId} onSubmit={submit} className="flex flex-col gap-3.5">
          {fields.map((f) => {
            const id = `${formId}-${f.key}`;
            const common = {
              id,
              value: values[f.key] ?? '',
              required: f.required,
              onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                setValues((v) => ({ ...v, [f.key]: e.target.value })),
              'aria-describedby': f.help ? `${id}-help` : undefined,
            };
            return (
              <div key={f.key}>
                <label htmlFor={id} className={FIELD_LABEL}>
                  {f.label}
                </label>
                {f.multiline ? (
                  <textarea rows={3} className={cn(FIELD_INPUT, 'resize-y')} {...common} />
                ) : (
                  <input type={f.type ?? 'text'} className={FIELD_INPUT} {...common} />
                )}
                {f.help && (
                  <p id={`${id}-help`} className="mt-1.5 text-[12.5px] text-ink-3">
                    {f.help}
                  </p>
                )}
              </div>
            );
          })}
          {error && (
            <p role="alert" className="rounded-[10px] bg-live-soft px-3 py-2.5 text-[13.5px] font-medium text-live">
              {error}
            </p>
          )}
        </form>
      )}
    </AppDialog>
  );
}
