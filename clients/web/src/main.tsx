import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { queryClient } from "./api/queryClient";
import { router } from "./routes";
import { FlashProvider } from "./lib/flash";

// vet.css is imported exactly once here so it applies globally like the Django
// <link>. It is a verbatim copy of appointments/static/vet.css — never edited.
import "./styles/vet.css";
// clinical.css adds ONLY the new classes the Sprint-3 clinical screens need
// (status badges, rich-text toolbar, confirm-dialog overlay). Imported AFTER
// vet.css so it never has to touch it; the 9 golden screens don't use these
// classes, so screenshot parity is unaffected.
import "./styles/clinical.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <FlashProvider>
        <RouterProvider router={router} />
      </FlashProvider>
    </QueryClientProvider>
  </StrictMode>,
);
