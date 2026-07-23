import { useFlash, alertClass } from "../lib/flash";

// App-page flash toasts: mirrors app_base.html's <div class="flash-stack"> that
// sits above the .app-shell. Renders nothing when there are no messages.
export default function FlashStack() {
  const { messages } = useFlash();
  if (messages.length === 0) return null;
  return (
    <div className="flash-stack">
      {messages.map((m) => (
        <div key={m.id} className={`alert ${alertClass(m.level)}`}>
          {m.text}
        </div>
      ))}
    </div>
  );
}
