'use client';

import { useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold, Italic, List, ListOrdered, AlignLeft, AlignCenter, AlignRight,
  Heading1, Heading2, Link as LinkIcon, ImageIcon, Eraser,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmailEditorProps {
  communitySlug: string;
  initialHtml?: string;
  onChange: (html: string, json: unknown) => void;
}

export function EmailEditor({ communitySlug, initialHtml = '', onChange }: EmailEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
        blockquote: false,
        codeBlock: false,
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right'] }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-indigo-600 underline' },
        // Reject javascript:/data:/vbscript: URLs to prevent XSS via the link picker
        validate: (href: string) =>
          /^https?:\/\//i.test(href) || /^mailto:/i.test(href) || /^tel:/i.test(href),
      }),
      Image.configure({ HTMLAttributes: { class: 'max-w-full rounded' } }),
      Placeholder.configure({ placeholder: 'Write your email…' }),
    ],
    content: initialHtml,
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-full focus:outline-none min-h-[400px] p-4',
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML(), editor.getJSON()),
    immediatelyRender: false,
  });

  if (!editor) return null;

  const setLink = () => {
    const previous = editor.getAttributes('link').href;
    const url = window.prompt('URL', previous);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const insertImage = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('communitySlug', communitySlug);
      const res = await fetch('/api/upload/broadcast-image', { method: 'POST', body: form });
      if (!res.ok) throw new Error(await res.text());
      const { url } = await res.json();
      editor.chain().focus().setImage({ src: url }).run();
    } finally {
      setUploading(false);
    }
  };

  const Btn = ({ onClick, active, children, label }: { onClick: () => void; active?: boolean; children: React.ReactNode; label: string }) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'h-8 w-8 flex items-center justify-center rounded-lg transition-colors',
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-primary/10'
      )}
    >
      {children}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 border rounded-lg p-2 bg-muted/30">
        <Btn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} label="Bold"><Bold className="h-4 w-4" /></Btn>
        <Btn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} label="Italic"><Italic className="h-4 w-4" /></Btn>
        <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} label="Heading 1"><Heading1 className="h-4 w-4" /></Btn>
        <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} label="Heading 2"><Heading2 className="h-4 w-4" /></Btn>
        <Btn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} label="Bullet list"><List className="h-4 w-4" /></Btn>
        <Btn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} label="Numbered list"><ListOrdered className="h-4 w-4" /></Btn>
        <Btn onClick={setLink} active={editor.isActive('link')} label="Link"><LinkIcon className="h-4 w-4" /></Btn>
        <Btn onClick={() => fileInputRef.current?.click()} label="Image"><ImageIcon className="h-4 w-4" /></Btn>
        <Btn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} label="Align left"><AlignLeft className="h-4 w-4" /></Btn>
        <Btn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} label="Align center"><AlignCenter className="h-4 w-4" /></Btn>
        <Btn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} label="Align right"><AlignRight className="h-4 w-4" /></Btn>
        <Btn onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} label="Clear formatting"><Eraser className="h-4 w-4" /></Btn>
        {uploading && <span className="text-xs text-muted-foreground">Uploading…</span>}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && insertImage(e.target.files[0])}
      />

      <div className="border-2 border-border/30 rounded-2xl bg-card">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
