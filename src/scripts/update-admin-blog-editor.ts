import fs from "fs";
import path from "path";

const clientRoot = path.resolve(__dirname, "../../../client");

console.log("[START] Applying Blog Content Editor to Admin CMS...");

// 1. Update upload.api.ts
const uploadApiPath = path.join(clientRoot, "src/shared/api/upload.api.ts");
if (fs.existsSync(uploadApiPath)) {
  let content = fs.readFileSync(uploadApiPath, "utf-8");
  if (!content.includes('"blog"')) {
    content = content.replace(
      'export type CloudinaryUploadType =\n  | "profile"\n  | "company-logo"\n  | "resume"\n  | "post"\n  | "chat-media";',
      'export type CloudinaryUploadType =\n  | "profile"\n  | "company-logo"\n  | "resume"\n  | "post"\n  | "chat-media"\n  | "blog";'
    );
    fs.writeFileSync(uploadApiPath, content, "utf-8");
    console.log("[UPDATED] client/src/shared/api/upload.api.ts");
  }
}

// 2. Update useCloudinaryUpload.ts
const useCloudinaryUploadPath = path.join(clientRoot, "src/shared/hooks/useCloudinaryUpload.ts");
if (fs.existsSync(useCloudinaryUploadPath)) {
  let content = fs.readFileSync(useCloudinaryUploadPath, "utf-8");
  if (!content.includes('type === "blog"')) {
    content = content.replace(
      '} else if (type === "profile" || type === "company-logo") {',
      '} else if (type === "profile" || type === "company-logo" || type === "blog") {'
    );
    fs.writeFileSync(useCloudinaryUploadPath, content, "utf-8");
    console.log("[UPDATED] client/src/shared/hooks/useCloudinaryUpload.ts");
  }
}

// 3. Create BlogContentEditor.tsx
const editorComponentPath = path.join(clientRoot, "src/features/admin/components/BlogContentEditor.tsx");
const editorCode = `import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading2,
  Heading3,
  Heading4,
  List,
  ListOrdered,
  Quote,
  Code,
  Link as LinkIcon,
  Undo,
  Redo,
  Eye,
  Edit3,
  Columns,
  Minus,
  Check,
  X,
  AlertCircle,
} from "lucide-react";

export interface BlogContentEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
  placeholder?: string;
  minHeight?: string;
}

/**
 * Cleanly sanitize and render markdown / structured text into safe React nodes
 * without using dangerous HTML injection or script execution.
 */
export function renderSafeMarkdown(content: string): ReactNode[] {
  if (!content || !content.trim()) {
    return [
      <p key="empty" className="text-slate-400 italic">
        No content to preview yet. Start typing in the Write tab.
      </p>,
    ];
  }

  const lines = content.split("\\n");
  const nodes: ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let codeBlockKey = 0;
  let inList: "ul" | "ol" | null = null;
  let listItems: ReactNode[] = [];
  let listKey = 0;

  const flushList = () => {
    if (inList && listItems.length > 0) {
      if (inList === "ul") {
        nodes.push(
          <ul
            key={\`ul-\${listKey++}\`}
            className="my-3 ml-6 list-disc space-y-1.5 text-slate-700 dark:text-slate-300"
          >
            {listItems}
          </ul>
        );
      } else {
        nodes.push(
          <ol
            key={\`ol-\${listKey++}\`}
            className="my-3 ml-6 list-decimal space-y-1.5 text-slate-700 dark:text-slate-300"
          >
            {listItems}
          </ol>
        );
      }
      inList = null;
      listItems = [];
    }
  };

  const flushCodeBlock = () => {
    if (inCodeBlock && codeBlockLines.length > 0) {
      nodes.push(
        <pre
          key={\`code-block-\${codeBlockKey++}\`}
          className="my-4 overflow-x-auto rounded-xl bg-slate-900 p-4 font-mono text-xs text-emerald-400 shadow-inner dark:bg-black"
        >
          <code>{codeBlockLines.join("\\n")}</code>
        </pre>
      );
      inCodeBlock = false;
      codeBlockLines = [];
    }
  };

  const parseInline = (text: string): ReactNode[] => {
    if (!text) return [];

    const regex =
      /(\\[[^\\]]+\\]\\([^)]+\\)|\\*\\*[^*]+\\*\\*|\\*[^*]+\\*|<u>[^<]+<\\/u>|\`[^\`]+\`)/g;

    const parts = text.split(regex);

    return parts.map((part, index) => {
      if (!part) return null;

      const linkMatch = part.match(/^\\[([^\\]]+)\\]\\(([^)]+)\\)$/);
      if (linkMatch) {
        const [, linkText, linkUrl] = linkMatch;
        const isSafeUrl = /^(https?:\\/\\/|mailto:|\\/|#)/i.test(linkUrl.trim());
        const href = isSafeUrl ? linkUrl.trim() : "#";

        return (
          <a
            key={index}
            href={href}
            target={href.startsWith("http") ? "_blank" : undefined}
            rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
            className="font-medium text-emerald-600 underline decoration-emerald-400/50 underline-offset-2 transition hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
          >
            {linkText}
          </a>
        );
      }

      if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
        return (
          <strong key={index} className="font-bold text-slate-900 dark:text-slate-100">
            {part.slice(2, -2)}
          </strong>
        );
      }

      if (part.startsWith("*") && part.endsWith("*") && part.length >= 2) {
        return (
          <em key={index} className="italic">
            {part.slice(1, -1)}
          </em>
        );
      }

      if (part.startsWith("<u>") && part.endsWith("</u>") && part.length >= 7) {
        return (
          <u key={index} className="underline underline-offset-2">
            {part.slice(3, -4)}
          </u>
        );
      }

      if (part.startsWith("\`") && part.endsWith("\`") && part.length >= 2) {
        return (
          <code
            key={index}
            className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-emerald-700 dark:bg-slate-800 dark:text-emerald-400"
          >
            {part.slice(1, -1)}
          </code>
        );
      }

      return part;
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (trimmed.startsWith("\`\`\`")) {
      if (inCodeBlock) {
        flushCodeBlock();
      } else {
        flushList();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(rawLine);
      continue;
    }

    if (/^(\\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
      flushList();
      nodes.push(
        <hr
          key={\`hr-\${i}\`}
          className="my-6 border-t border-slate-200 dark:border-slate-800"
        />
      );
      continue;
    }

    if (trimmed.startsWith("#### ")) {
      flushList();
      nodes.push(
        <h4
          key={\`h4-\${i}\`}
          className="mt-6 mb-2 text-base font-bold tracking-tight text-slate-900 dark:text-slate-100"
        >
          {parseInline(trimmed.slice(5))}
        </h4>
      );
      continue;
    }

    if (trimmed.startsWith("### ")) {
      flushList();
      nodes.push(
        <h3
          key={\`h3-\${i}\`}
          className="mt-7 mb-2 text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100"
        >
          {parseInline(trimmed.slice(4))}
        </h3>
      );
      continue;
    }

    if (trimmed.startsWith("## ") || trimmed.startsWith("# ")) {
      flushList();
      const text = trimmed.startsWith("## ") ? trimmed.slice(3) : trimmed.slice(2);
      nodes.push(
        <h2
          key={\`h2-\${i}\`}
          className="mt-8 mb-3 text-xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100"
        >
          {parseInline(text)}
        </h2>
      );
      continue;
    }

    if (trimmed.startsWith("> ")) {
      flushList();
      nodes.push(
        <blockquote
          key={\`quote-\${i}\`}
          className="my-4 border-l-4 border-emerald-500 bg-slate-50/75 py-2.5 px-4 rounded-r-xl italic text-slate-700 dark:bg-slate-900/50 dark:text-slate-300"
        >
          {parseInline(trimmed.slice(2))}
        </blockquote>
      );
      continue;
    }

    if (/^[-*]\\s+/.test(trimmed)) {
      if (inList !== "ul") {
        flushList();
        inList = "ul";
      }
      const itemText = trimmed.replace(/^[-*]\\s+/, "");
      listItems.push(<li key={\`li-\${i}\`}>{parseInline(itemText)}</li>);
      continue;
    }

    if (/^\\d+\\.\\s+/.test(trimmed)) {
      if (inList !== "ol") {
        flushList();
        inList = "ol";
      }
      const itemText = trimmed.replace(/^\\d+\\.\\s+/, "");
      listItems.push(<li key={\`li-\${i}\`}>{parseInline(itemText)}</li>);
      continue;
    }

    flushList();

    if (!trimmed) {
      continue;
    }

    nodes.push(
      <p
        key={\`p-\${i}\`}
        className="my-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300"
      >
        {parseInline(rawLine)}
      </p>
    );
  }

  flushList();
  flushCodeBlock();

  return nodes;
}

export default function BlogContentEditor({
  value,
  onChange,
  disabled = false,
  error,
  placeholder = "Write your blog post content here with headings, lists, and formatted text...",
  minHeight = "360px",
}: BlogContentEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [activeTab, setActiveTab] = useState<"write" | "preview" | "split">("write");

  const [history, setHistory] = useState<string[]>([value || ""]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const isInternalChange = useRef(false);

  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkText, setLinkText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  useEffect(() => {
    if (!isInternalChange.current && value !== history[historyIndex]) {
      setHistory([value || ""]);
      setHistoryIndex(0);
    }
    isInternalChange.current = false;
  }, [value, history, historyIndex]);

  const updateContentWithHistory = useCallback(
    (newContent: string) => {
      isInternalChange.current = true;
      onChange(newContent);

      setHistory((prev) => {
        const next = prev.slice(0, historyIndex + 1);
        next.push(newContent);
        if (next.length > 50) next.shift();
        return next;
      });
      setHistoryIndex((prev) => Math.min(prev + 1, 49));
    },
    [onChange, historyIndex]
  );

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      const prevValue = history[prevIndex];
      setHistoryIndex(prevIndex);
      isInternalChange.current = true;
      onChange(prevValue);
    }
  }, [history, historyIndex, onChange]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      const nextValue = history[nextIndex];
      setHistoryIndex(nextIndex);
      isInternalChange.current = true;
      onChange(nextValue);
    }
  }, [history, historyIndex, onChange]);

  const insertFormatting = useCallback(
    (prefix: string, suffix = "", defaultText = "") => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const currentVal = textarea.value;
      const selectedText = currentVal.substring(start, end) || defaultText;

      const replacement = \`\${prefix}\${selectedText}\${suffix}\`;
      const updatedValue =
        currentVal.substring(0, start) + replacement + currentVal.substring(end);

      updateContentWithHistory(updatedValue);

      setTimeout(() => {
        textarea.focus();
        const newCursorPos = start + prefix.length + selectedText.length;
        textarea.setSelectionRange(
          start + prefix.length,
          newCursorPos
        );
      }, 0);
    },
    [updateContentWithHistory]
  );

  const applyLinePrefix = useCallback(
    (prefix: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const currentVal = textarea.value;

      const lineStart = currentVal.lastIndexOf("\\n", start - 1) + 1;
      const lineEnd = currentVal.indexOf("\\n", start);
      const effectiveLineEnd = lineEnd === -1 ? currentVal.length : lineEnd;
      const currentLine = currentVal.substring(lineStart, effectiveLineEnd);

      let newLine = "";
      if (currentLine.startsWith(prefix)) {
        newLine = currentLine.slice(prefix.length);
      } else {
        const strippedLine = currentLine.replace(/^(#{1,6}\\s+|[-*]\\s+|\\d+\\.\\s+|> )/, "");
        newLine = \`\${prefix}\${strippedLine}\`;
      }

      const updatedValue =
        currentVal.substring(0, lineStart) +
        newLine +
        currentVal.substring(effectiveLineEnd);

      updateContentWithHistory(updatedValue);

      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(lineStart + newLine.length, lineStart + newLine.length);
      }, 0);
    },
    [updateContentWithHistory]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    const modifier = isMac ? e.metaKey : e.ctrlKey;

    if (modifier) {
      if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        insertFormatting("**", "**", "bold text");
        return;
      }
      if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        insertFormatting("*", "*", "italic text");
        return;
      }
      if (e.key === "u" || e.key === "U") {
        e.preventDefault();
        insertFormatting("<u>", "</u>", "underlined text");
        return;
      }
      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        const textarea = textareaRef.current;
        const selected = textarea
          ? textarea.value.substring(textarea.selectionStart, textarea.selectionEnd)
          : "";
        setLinkText(selected || "");
        setLinkUrl("");
        setShowLinkModal(true);
        return;
      }
      if (e.key === "z" || e.key === "Z") {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
        return;
      }
      if (e.key === "y" || e.key === "Y") {
        e.preventDefault();
        handleRedo();
        return;
      }
    }

    if (e.key === "Tab") {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const val = textarea.value;
      const updated = val.substring(0, start) + "  " + val.substring(end);
      updateContentWithHistory(updated);
      setTimeout(() => {
        textarea.setSelectionRange(start + 2, start + 2);
      }, 0);
      return;
    }

    if (e.key === "Enter") {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const val = textarea.value;
      const lineStart = val.lastIndexOf("\\n", start - 1) + 1;
      const currentLine = val.substring(lineStart, start);

      const bulletMatch = currentLine.match(/^([-*]\\s+)/);
      if (bulletMatch) {
        if (currentLine.trim() === "-" || currentLine.trim() === "*") {
          e.preventDefault();
          const updated = val.substring(0, lineStart) + val.substring(start);
          updateContentWithHistory(updated);
          setTimeout(() => {
            textarea.setSelectionRange(lineStart, lineStart);
          }, 0);
          return;
        }
        e.preventDefault();
        const prefix = \`\\n\${bulletMatch[1]}\`;
        const updated = val.substring(0, start) + prefix + val.substring(start);
        updateContentWithHistory(updated);
        setTimeout(() => {
          textarea.setSelectionRange(start + prefix.length, start + prefix.length);
        }, 0);
        return;
      }

      const numMatch = currentLine.match(/^(\\d+)\\.\\s+/);
      if (numMatch) {
        const num = parseInt(numMatch[1], 10);
        if (currentLine.trim() === \`\${num}.\`) {
          e.preventDefault();
          const updated = val.substring(0, lineStart) + val.substring(start);
          updateContentWithHistory(updated);
          setTimeout(() => {
            textarea.setSelectionRange(lineStart, lineStart);
          }, 0);
          return;
        }
        e.preventDefault();
        const prefix = \`\\n\${num + 1}. \`;
        const updated = val.substring(0, start) + prefix + val.substring(start);
        updateContentWithHistory(updated);
        setTimeout(() => {
          textarea.setSelectionRange(start + prefix.length, start + prefix.length);
        }, 0);
        return;
      }

      const quoteMatch = currentLine.match(/^(>\\s+)/);
      if (quoteMatch) {
        if (currentLine.trim() === ">") {
          e.preventDefault();
          const updated = val.substring(0, lineStart) + val.substring(start);
          updateContentWithHistory(updated);
          setTimeout(() => {
            textarea.setSelectionRange(lineStart, lineStart);
          }, 0);
          return;
        }
        e.preventDefault();
        const prefix = "\\n> ";
        const updated = val.substring(0, start) + prefix + val.substring(start);
        updateContentWithHistory(updated);
        setTimeout(() => {
          textarea.setSelectionRange(start + prefix.length, start + prefix.length);
        }, 0);
        return;
      }
    }
  };

  const handleInsertLinkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkUrl.trim()) return;

    let finalUrl = linkUrl.trim();
    if (!/^(https?:\\/\\/|mailto:|\\/|#)/i.test(finalUrl)) {
      finalUrl = \`https://\${finalUrl}\`;
    }

    const text = linkText.trim() || finalUrl;
    insertFormatting(\`[\${text}](\`, \`)\`, finalUrl);
    setShowLinkModal(false);
    setLinkText("");
    setLinkUrl("");
  };

  const wordCount = (value || "").trim().split(/\\s+/).filter(Boolean).length;
  const charCount = (value || "").length;

  return (
    <div className="relative rounded-2xl border border-slate-200 bg-white shadow-xs transition focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-900">
      {/* ── Top Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/80 rounded-t-2xl">
        <div className="flex flex-wrap items-center gap-1">
          {/* Headings */}
          <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs dark:border-slate-700 dark:bg-slate-800">
            <button
              type="button"
              disabled={disabled || activeTab === "preview"}
              onClick={() => applyLinePrefix("## ")}
              className="rounded-md p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-700"
              title="Heading 2 (##)"
            >
              <Heading2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={disabled || activeTab === "preview"}
              onClick={() => applyLinePrefix("### ")}
              className="rounded-md p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-700"
              title="Heading 3 (###)"
            >
              <Heading3 className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={disabled || activeTab === "preview"}
              onClick={() => applyLinePrefix("#### ")}
              className="rounded-md p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-700"
              title="Heading 4 (####)"
            >
              <Heading4 className="h-4 w-4" />
            </button>
          </div>

          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 mx-0.5" />

          {/* Inline Styles */}
          <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs dark:border-slate-700 dark:bg-slate-800">
            <button
              type="button"
              disabled={disabled || activeTab === "preview"}
              onClick={() => insertFormatting("**", "**", "bold text")}
              className="rounded-md p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-700"
              title="Bold (Ctrl+B)"
            >
              <Bold className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={disabled || activeTab === "preview"}
              onClick={() => insertFormatting("*", "*", "italic text")}
              className="rounded-md p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-700"
              title="Italic (Ctrl+I)"
            >
              <Italic className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={disabled || activeTab === "preview"}
              onClick={() => insertFormatting("<u>", "</u>", "underlined text")}
              className="rounded-md p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-700"
              title="Underline (Ctrl+U)"
            >
              <UnderlineIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={disabled || activeTab === "preview"}
              onClick={() => insertFormatting("\`", "\`", "code")}
              className="rounded-md p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-700"
              title="Inline Code"
            >
              <Code className="h-4 w-4" />
            </button>
          </div>

          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 mx-0.5" />

          {/* Blocks & Lists */}
          <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs dark:border-slate-700 dark:bg-slate-800">
            <button
              type="button"
              disabled={disabled || activeTab === "preview"}
              onClick={() => applyLinePrefix("- ")}
              className="rounded-md p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-700"
              title="Bullet List (- )"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={disabled || activeTab === "preview"}
              onClick={() => applyLinePrefix("1. ")}
              className="rounded-md p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-700"
              title="Numbered List (1. )"
            >
              <ListOrdered className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={disabled || activeTab === "preview"}
              onClick={() => applyLinePrefix("> ")}
              className="rounded-md p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-700"
              title="Blockquote (> )"
            >
              <Quote className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={disabled || activeTab === "preview"}
              onClick={() => insertFormatting("\`\`\`\\n", "\\n\`\`\`", "code snippet here")}
              className="rounded-md p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-700"
              title="Code Block (\`\`\`)"
            >
              <span className="font-mono text-xs font-bold px-0.5">{"{ }"}</span>
            </button>
            <button
              type="button"
              disabled={disabled || activeTab === "preview"}
              onClick={() => insertFormatting("\\n---\\n")}
              className="rounded-md p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-700"
              title="Horizontal Divider (---)"
            >
              <Minus className="h-4 w-4" />
            </button>
          </div>

          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 mx-0.5" />

          {/* Link Modal trigger */}
          <button
            type="button"
            disabled={disabled || activeTab === "preview"}
            onClick={() => {
              const textarea = textareaRef.current;
              const selected = textarea
                ? textarea.value.substring(textarea.selectionStart, textarea.selectionEnd)
                : "";
              setLinkText(selected || "");
              setLinkUrl("");
              setShowLinkModal(true);
            }}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-2xs transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            title="Insert Link (Ctrl+K)"
          >
            <LinkIcon className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Link</span>
          </button>

          {/* Undo / Redo */}
          <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs dark:border-slate-700 dark:bg-slate-800">
            <button
              type="button"
              disabled={disabled || historyIndex <= 0 || activeTab === "preview"}
              onClick={handleUndo}
              className="rounded-md p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-slate-700"
              title="Undo (Ctrl+Z)"
            >
              <Undo className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={
                disabled ||
                historyIndex >= history.length - 1 ||
                activeTab === "preview"
              }
              onClick={handleRedo}
              className="rounded-md p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-slate-700"
              title="Redo (Ctrl+Y)"
            >
              <Redo className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab("write")}
            className={\`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition \${
              activeTab === "write"
                ? "bg-white text-emerald-700 shadow-2xs dark:bg-slate-900 dark:text-emerald-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }\`}
          >
            <Edit3 className="h-3.5 w-3.5" />
            <span>Write</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("preview")}
            className={\`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition \${
              activeTab === "preview"
                ? "bg-white text-emerald-700 shadow-2xs dark:bg-slate-900 dark:text-emerald-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }\`}
          >
            <Eye className="h-3.5 w-3.5" />
            <span>Preview</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("split")}
            className={\`hidden sm:flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition \${
              activeTab === "split"
                ? "bg-white text-emerald-700 shadow-2xs dark:bg-slate-900 dark:text-emerald-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }\`}
            title="Split Side-by-Side View"
          >
            <Columns className="h-3.5 w-3.5" />
            <span>Split</span>
          </button>
        </div>
      </div>

      {/* ── Editor Body Area ── */}
      <div
        className={\`relative \${
          activeTab === "split" ? "grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800" : ""
        }\`}
      >
        {/* Write Pane */}
        {(activeTab === "write" || activeTab === "split") && (
          <div className="relative flex flex-col">
            <textarea
              ref={textareaRef}
              value={value}
              disabled={disabled}
              onChange={(e) => updateContentWithHistory(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              style={{ minHeight }}
              className="w-full resize-y bg-transparent p-4 font-mono text-sm leading-relaxed text-slate-800 outline-none transition placeholder:text-slate-400 disabled:bg-slate-50/50 disabled:opacity-60 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>
        )}

        {/* Live Preview Pane */}
        {(activeTab === "preview" || activeTab === "split") && (
          <div
            style={{ minHeight }}
            className="overflow-y-auto bg-slate-50/40 p-5 dark:bg-slate-950/40"
          >
            {activeTab === "split" && (
              <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-800">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Live Preview
                </span>
              </div>
            )}
            <div className="prose prose-slate max-w-none text-sm leading-relaxed dark:prose-invert">
              {renderSafeMarkdown(value)}
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom Metrics & Status Bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 px-4 py-2.5 text-xs text-slate-500 rounded-b-2xl dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
        <div className="flex items-center gap-4">
          <span>{wordCount} words</span>
          <span>{charCount} characters</span>
        </div>

        <div className="flex items-center gap-2 text-slate-400">
          <span>Formatting:</span>
          <span className="font-mono text-[11px] bg-slate-200/60 px-1.5 py-0.5 rounded dark:bg-slate-800">
            Markdown & HTML tags supported
          </span>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-rose-500">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </p>
      )}

      {/* ── Link Insertion Modal ── */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <LinkIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Insert Hyperlink
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setShowLinkModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleInsertLinkSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Link Text
                </label>
                <input
                  type="text"
                  value={linkText}
                  onChange={(e) => setLinkText(e.target.value)}
                  placeholder="e.g. Read full guide here"
                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  URL Destination <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://example.com/guide or /jobs"
                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLinkModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-700"
                >
                  <Check className="h-3.5 w-3.5" />
                  Insert Link
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
`;

fs.writeFileSync(editorComponentPath, editorCode, "utf-8");
console.log("[CREATED] client/src/features/admin/components/BlogContentEditor.tsx");

// 4. Update AdminBlogForm.tsx to use BlogContentEditor
const formComponentPath = path.join(clientRoot, "src/features/admin/components/AdminBlogForm.tsx");
if (fs.existsSync(formComponentPath)) {
  let content = fs.readFileSync(formComponentPath, "utf-8");

  // Add import if missing
  if (!content.includes("BlogContentEditor")) {
    content = content.replace(
      'import { useBlogCategories } from "../hooks/useAdminBlogs";',
      'import { useBlogCategories } from "../hooks/useAdminBlogs";\nimport BlogContentEditor from "./BlogContentEditor";'
    );
  }

  // Update handleImageUpload to use "blog"
  content = content.replace(
    'const result = await uploadFile(file, "post");',
    'const result = await uploadFile(file, "blog");'
  );

  // Replace textarea with BlogContentEditor
  const oldTextareaPattern = `<textarea
              id={\`\${formId}-content\`}
              rows={14}
              required
              value={form.content}
              onChange={(e) => updateField("content", e.target.value)}
              placeholder="Write your article in Markdown or rich text format..."
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3.5 font-mono text-sm leading-relaxed text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            {errors.content && (
              <p className="mt-1 flex items-center gap-1 text-xs text-rose-500">
                <AlertCircle className="h-3.5 w-3.5" />
                {errors.content}
              </p>
            )}`;

  const newEditorMarkup = `<div className="mt-1.5">
              <BlogContentEditor
                value={form.content}
                onChange={(val) => updateField("content", val)}
                disabled={isSubmitting}
                error={errors.content}
                placeholder="Write your article in Markdown or structured rich text format with headings, bold, bullet points, links, and code blocks..."
              />
            </div>`;

  if (content.includes(oldTextareaPattern)) {
    content = content.replace(oldTextareaPattern, newEditorMarkup);
    fs.writeFileSync(formComponentPath, content, "utf-8");
    console.log("[UPDATED] client/src/features/admin/components/AdminBlogForm.tsx with BlogContentEditor");
  } else {
    console.log("[NOTICE] Pattern match check in AdminBlogForm.tsx");
  }
}

console.log("[SUCCESS] Blog Content Editor setup completed.");
