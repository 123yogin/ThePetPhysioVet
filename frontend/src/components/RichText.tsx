import { useEffect, useRef } from "react";

// Tiny controlled-ish rich-text editor (no heavy dependency). It wraps a
// contenteditable div styled with .input-glass and offers bold / italic /
// list buttons via document.execCommand. It EMITS raw HTML upward; the server
// sanitises it with bleach before storing, and the app only ever renders those
// server-sanitised values via dangerouslySetInnerHTML.
//
// The editor is seeded from `value` once (and whenever `value` is replaced from
// the outside, e.g. edit prefill or a post-submit reset) — we compare against
// the live innerHTML so ordinary keystrokes never re-seed and clobber the caret.

interface RichTextProps {
  id?: string;
  value: string; // HTML
  onChange: (html: string) => void;
  ariaLabel?: string;
  placeholder?: string;
}

export default function RichText({ id, value, onChange, ariaLabel, placeholder }: RichTextProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== value) el.innerHTML = value;
  }, [value]);

  function emit() {
    onChange(ref.current?.innerHTML ?? "");
  }

  function exec(command: string) {
    // Keep focus in the editor so the command targets its selection.
    ref.current?.focus();
    document.execCommand(command, false);
    emit();
  }

  return (
    <div className="rt">
      <div className="rt-toolbar" role="toolbar" aria-label="Text formatting">
        <button type="button" className="rt-btn" aria-label="Bold" title="Bold"
          onMouseDown={(e) => e.preventDefault()} onClick={() => exec("bold")}>
          <strong>B</strong>
        </button>
        <button type="button" className="rt-btn" aria-label="Italic" title="Italic"
          onMouseDown={(e) => e.preventDefault()} onClick={() => exec("italic")}>
          <em>I</em>
        </button>
        <button type="button" className="rt-btn" aria-label="Bulleted list" title="Bulleted list"
          onMouseDown={(e) => e.preventDefault()} onClick={() => exec("insertUnorderedList")}>
          &bull; List
        </button>
        <button type="button" className="rt-btn" aria-label="Numbered list" title="Numbered list"
          onMouseDown={(e) => e.preventDefault()} onClick={() => exec("insertOrderedList")}>
          1. List
        </button>
      </div>
      <div
        id={id}
        ref={ref}
        className="input-glass rt-editor"
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        data-placeholder={placeholder}
        onInput={emit}
        suppressContentEditableWarning
      />
    </div>
  );
}
