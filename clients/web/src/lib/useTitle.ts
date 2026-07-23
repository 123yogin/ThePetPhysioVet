import { useEffect } from "react";

// Sets document.title to the exact Django <title> string for the screen.
export function useTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
