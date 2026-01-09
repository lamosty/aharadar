"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

interface QueryProviderProps {
  children: ReactNode;
}

/**
 * QueryProvider wraps the application with TanStack Query's QueryClientProvider.
 *
 * Configuration:
 * - staleTime: 30s - data considered fresh for 30 seconds
 * - gcTime: 5 minutes - cached data kept for 5 minutes after last use
 * - retry: 1 - retry failed requests once
 * - refetchOnWindowFocus: true - refetch when user returns to tab
 */
export function QueryProvider({ children }: QueryProviderProps) {
  // Create QueryClient in state to avoid recreating on every render
  // and to ensure each request gets its own QueryClient in SSR
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Data considered fresh for 30 seconds
            staleTime: 30 * 1000,
            // Keep cached data for 5 minutes after last use
            gcTime: 5 * 60 * 1000,
            // Retry failed requests once
            retry: 1,
            // Refetch when window regains focus
            refetchOnWindowFocus: true,
            // Don't refetch on mount if data is fresh
            refetchOnMount: "always",
            // Use cached data while revalidating
            placeholderData: (previousData: unknown) => previousData,
          },
          mutations: {
            // Retry mutations once
            retry: 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
