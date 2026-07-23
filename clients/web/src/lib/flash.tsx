// Tiny flash-message store so post-mutation redirects can show the same toasts
// Django's messages framework rendered. Messages survive one navigation.

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type FlashLevel = "success" | "error" | "info";

export interface FlashMessage {
  id: number;
  level: FlashLevel;
  text: string;
}

interface FlashContextValue {
  messages: FlashMessage[];
  push: (level: FlashLevel, text: string) => void;
  clear: () => void;
}

const FlashContext = createContext<FlashContextValue | null>(null);

let nextId = 1;

export function FlashProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<FlashMessage[]>([]);

  const value = useMemo<FlashContextValue>(
    () => ({
      messages,
      push: (level, text) =>
        setMessages((prev) => [...prev, { id: nextId++, level, text }]),
      clear: () => setMessages([]),
    }),
    [messages],
  );

  return <FlashContext.Provider value={value}>{children}</FlashContext.Provider>;
}

export function useFlash(): FlashContextValue {
  const ctx = useContext(FlashContext);
  if (!ctx) throw new Error("useFlash must be used within <FlashProvider>");
  return ctx;
}

// Maps a Django message tag/level to the vet.css alert modifier class.
export function alertClass(level: FlashLevel): string {
  if (level === "error") return "alert-danger";
  if (level === "success") return "alert-success";
  return "alert-info";
}
