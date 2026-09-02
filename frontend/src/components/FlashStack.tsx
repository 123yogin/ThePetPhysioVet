import React from 'react';
import { useFlash } from '../lib/flash';

export const FlashStack: React.FC = () => {
  const { messages, removeFlash } = useFlash();

  if (messages.length === 0) return null;

  return (
    <div className="flash-stack">
      {messages.map((m) => (
        <div
          key={m.id}
          className={`flash-item alert-${m.type === 'error' ? 'danger' : m.type}`}
          onClick={() => removeFlash(m.id)}
          style={{ cursor: 'pointer' }}
        >
          <span>{m.text}</span>
          <span style={{ marginLeft: '12px', opacity: 0.7 }}>&times;</span>
        </div>
      ))}
    </div>
  );
};
