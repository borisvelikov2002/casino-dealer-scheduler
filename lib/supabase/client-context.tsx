"use client"

import { createContext, useContext, type ReactNode } from "react"
import { supabase } from "./index"

// Create a React context for the Supabase client
const SupabaseContext = createContext(supabase)

// Provider component
export function SupabaseProvider({ children }: { children: ReactNode }) {
  return <SupabaseContext.Provider value={supabase}>{children}</SupabaseContext.Provider>
}

// Hook to use the Supabase client
export function useSupabase() {
  return useContext(SupabaseContext)
}

// Re-export the supabase client for backward compatibility
export { supabase }

// Function to get the Supabase client (legacy support)
export function getSupabaseClient() {
  if (typeof window === "undefined") {
    // For server-side rendering, return a dummy client
    return {
      from: () => ({
        select: () => ({ data: null, error: null }),
        insert: () => ({ data: null, error: null }),
        update: () => ({ data: null, error: null }),
        delete: () => ({ data: null, error: null }),
      }),
    } as any
  }

  return supabase
}
