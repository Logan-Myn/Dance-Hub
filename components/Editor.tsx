"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import TextStyle from "@tiptap/extension-text-style";
import Placeholder from "@tiptap/extension-placeholder";
import { Extension } from "@tiptap/core";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Quote,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Heading1,
  Heading2,
  Heading3,
  Type,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Custom extension to handle text sizes
const CustomTextStyle = Extension.create({
  name: "customTextStyle",

  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize,
            renderHTML: (attributes) => {
              if (!attributes.fontSize) {
                return {};
              }
              return {
                style: `font-size: ${attributes.fontSize}`,
              };
            },
          },
        },
      },
    ];
  },
});

interface EditorProps {
  content: string;
  onChange: (html: string) => void;
  editable?: boolean;
  showHeadings?: boolean;
  showParagraphStyle?: boolean;
  showAlignment?: boolean;
  placeholder?: string;
  minHeight?: string;
}

// Toolbar button component following Fluid Movement design
function ToolbarButton({
  onClick,
  isActive,
  tooltip,
  children,
}: {
  onClick: () => void;
  isActive: boolean;
  tooltip: string;
  children: React.ReactNode;
}) {
  // Phones have no hover, so a tap also shows the button's name for a moment.
  // While it shows, the tooltip ignores its own close requests: the command
  // moves focus into the editor a frame later, and that blur would close it.
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const touched = useRef(false);
  const pinned = useRef(false);
  const hide = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const unpin = () => {
    pinned.current = false;
    clearTimeout(hide.current);
    setOpen(false);
  };
  useEffect(() => () => clearTimeout(hide.current), []);

  return (
    <Tooltip open={open} onOpenChange={(next) => (next || !pinned.current) && setOpen(next)}>
      <TooltipTrigger asChild>
        <button
          ref={button}
          type="button"
          aria-label={tooltip}
          aria-pressed={isActive}
          onPointerDown={(e) => {
            touched.current = e.pointerType !== "mouse";
          }}
          onClick={(e) => {
            onClick();
            // A later Enter or Space on this button is not a tap.
            const tap = touched.current;
            touched.current = false;
            if (!tap) return;
            // Stops the tooltip's own click handler from closing it again.
            e.preventDefault();
            pinned.current = true;
            setOpen(true);
            clearTimeout(hide.current);
            hide.current = setTimeout(unpin, 1500);
          }}
          className={cn(
            "h-8 w-8 flex items-center justify-center rounded-lg",
            "transition-all duration-200 ease-out",
            "hover:bg-primary/10 hover:text-primary",
            "focus:outline-none focus:ring-2 focus:ring-primary/50",
            isActive
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground"
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      {/* A tap elsewhere, such as on the next button, still closes it; a tap
          on this button again keeps it. Taps go through it to the text. */}
      <TooltipContent
        side="bottom"
        className="pointer-events-none text-xs"
        onEscapeKeyDown={unpin}
        onPointerDownOutside={(e) => {
          if (button.current?.contains(e.target as Node)) {
            e.preventDefault();
            return;
          }
          unpin();
        }}
      >
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

// Toolbar group wrapper
function ToolbarGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-0.5 bg-muted/50 rounded-xl p-1">
      {children}
    </div>
  );
}

export default function Editor({
  content,
  onChange,
  editable = true,
  showHeadings = true,
  showParagraphStyle = true,
  showAlignment = true,
  placeholder = "Write something...",
  minHeight = "150px",
}: EditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: showHeadings
          ? {
              levels: [1, 2, 3],
            }
          : false,
        bulletList: {
          HTMLAttributes: {
            class: "list-disc list-inside",
          },
        },
        orderedList: {
          HTMLAttributes: {
            class: "list-decimal list-inside",
          },
        },
        listItem: {
          HTMLAttributes: {
            class: "marker:text-current",
          },
        },
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
        alignments: ["left", "center", "right", "justify"],
      }),
      TextStyle,
      CustomTextStyle,
      Placeholder.configure({
        placeholder,
        emptyEditorClass:
          "before:content-[attr(data-placeholder)] before:text-muted-foreground/50 before:float-left before:h-0 before:pointer-events-none",
      }),
    ],
    content,
    editable,
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm max-w-full focus:outline-none",
          "[&>ul>li>*]:inline",
          "[&>ol>li>*]:inline",
          "[&>blockquote]:relative",
          "[&>blockquote]:pl-6",
          "[&>blockquote]:pr-4",
          "[&>blockquote]:my-4",
          "[&>blockquote]:border-l-4",
          "[&>blockquote]:border-primary/30",
          "[&>blockquote]:bg-muted/30",
          "[&>blockquote]:rounded-r-xl",
          "[&>blockquote]:py-2",
          "[&>blockquote]:not-italic",
          "[&>blockquote>p]:relative",
          "[&>blockquote>p]:m-0",
          "[&>blockquote>p]:leading-[1.6]",
          "[&>blockquote>p]:text-muted-foreground"
        ),
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  if (!editor) {
    return null;
  }

  const setTextSize = (size: string | null) => {
    editor.chain().focus().setMark("textStyle", { fontSize: size }).run();
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-3">
        {/* Toolbar */}
        {editable && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Text formatting */}
            <ToolbarGroup>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleBold().run()}
                isActive={editor.isActive("bold")}
                tooltip="Bold"
              >
                <Bold className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleItalic().run()}
                isActive={editor.isActive("italic")}
                tooltip="Italic"
              >
                <Italic className="h-4 w-4" />
              </ToolbarButton>
            </ToolbarGroup>

            {/* Headings */}
            {(showParagraphStyle || showHeadings) && (
              <ToolbarGroup>
                {showParagraphStyle && (
                  <ToolbarButton
                    onClick={() => editor.chain().focus().setParagraph().run()}
                    isActive={
                      editor.isActive("paragraph") &&
                      !editor.isActive("heading")
                    }
                    tooltip="Paragraph"
                  >
                    <Type className="h-4 w-4" />
                  </ToolbarButton>
                )}
                {showHeadings && (
                  <>
                    <ToolbarButton
                      onClick={() => {
                        const isInList = editor.isActive("listItem");
                        if (isInList) {
                          const hasCustomSize = editor.isActive("textStyle", {
                            fontSize: "2.25rem",
                          });
                          setTextSize(hasCustomSize ? null : "2.25rem");
                        } else {
                          editor
                            .chain()
                            .focus()
                            .toggleHeading({ level: 1 })
                            .run();
                        }
                      }}
                      isActive={editor.isActive("heading", { level: 1 })}
                      tooltip="Heading 1"
                    >
                      <Heading1 className="h-4 w-4" />
                    </ToolbarButton>
                    <ToolbarButton
                      onClick={() => {
                        const isInList = editor.isActive("listItem");
                        if (isInList) {
                          const hasCustomSize = editor.isActive("textStyle", {
                            fontSize: "1.875rem",
                          });
                          setTextSize(hasCustomSize ? null : "1.875rem");
                        } else {
                          editor
                            .chain()
                            .focus()
                            .toggleHeading({ level: 2 })
                            .run();
                        }
                      }}
                      isActive={editor.isActive("heading", { level: 2 })}
                      tooltip="Heading 2"
                    >
                      <Heading2 className="h-4 w-4" />
                    </ToolbarButton>
                    <ToolbarButton
                      onClick={() => {
                        const isInList = editor.isActive("listItem");
                        if (isInList) {
                          const hasCustomSize = editor.isActive("textStyle", {
                            fontSize: "1.5rem",
                          });
                          setTextSize(hasCustomSize ? null : "1.5rem");
                        } else {
                          editor
                            .chain()
                            .focus()
                            .toggleHeading({ level: 3 })
                            .run();
                        }
                      }}
                      isActive={editor.isActive("heading", { level: 3 })}
                      tooltip="Heading 3"
                    >
                      <Heading3 className="h-4 w-4" />
                    </ToolbarButton>
                  </>
                )}
              </ToolbarGroup>
            )}

            {/* Lists & Quote */}
            <ToolbarGroup>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                isActive={editor.isActive("bulletList")}
                tooltip="Bullet list"
              >
                <List className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                isActive={editor.isActive("orderedList")}
                tooltip="Numbered list"
              >
                <ListOrdered className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
                isActive={editor.isActive("blockquote")}
                tooltip="Quote"
              >
                <Quote className="h-4 w-4" />
              </ToolbarButton>
            </ToolbarGroup>

            {/* Alignment */}
            {showAlignment && (
              <ToolbarGroup>
                <ToolbarButton
                  onClick={() =>
                    editor.chain().focus().setTextAlign("left").run()
                  }
                  isActive={editor.isActive({ textAlign: "left" })}
                  tooltip="Align left"
                >
                  <AlignLeft className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  onClick={() =>
                    editor.chain().focus().setTextAlign("center").run()
                  }
                  isActive={editor.isActive({ textAlign: "center" })}
                  tooltip="Align center"
                >
                  <AlignCenter className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  onClick={() =>
                    editor.chain().focus().setTextAlign("right").run()
                  }
                  isActive={editor.isActive({ textAlign: "right" })}
                  tooltip="Align right"
                >
                  <AlignRight className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  onClick={() =>
                    editor.chain().focus().setTextAlign("justify").run()
                  }
                  isActive={editor.isActive({ textAlign: "justify" })}
                  tooltip="Justify"
                >
                  <AlignJustify className="h-4 w-4" />
                </ToolbarButton>
              </ToolbarGroup>
            )}
          </div>
        )}

        {/* Editor content area */}
        <div
          onClick={() => editable && editor?.chain().focus().run()}
          className={cn(
            "w-full rounded-2xl bg-muted/30 transition-all duration-200 cursor-text",
            editable && [
              "border-2 border-transparent",
              "focus-within:border-primary/20 focus-within:bg-card",
              "hover:border-border/50",
            ],
            !editable && "bg-transparent cursor-default"
          )}
          style={{ minHeight: editable ? minHeight : "auto" }}
        >
          <div className={cn("p-4 h-full", !editable && "p-0")}>
            <EditorContent
              editor={editor}
              className={cn(editable && "min-h-full [&>.tiptap]:min-h-full [&>.tiptap]:outline-none")}
            />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
