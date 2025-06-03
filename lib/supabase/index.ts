import { createClient } from "@supabase/supabase-js"

// This is the ONLY place where we create a Supabase client
// We use a module-level variable to ensure a single instance
let supabaseClient: ReturnType<typeof createClient> | null = null

// Function to get the Supabase client
export function getSupabase() {
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

  if (supabaseClient) return supabaseClient

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  // Create a single instance with specific options to prevent multiple instances
  supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false, // Disable auto detection to prevent multiple instances
      storageKey: "casino-scheduler-auth-v4", // Use a unique storage key
    },
  })

  return supabaseClient
}

// Export a singleton instance for direct imports
export const supabase = getSupabase()

// Server-side Supabase client (used in Server Components)
export function createServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  // Create a new client with the service role key
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false, // Don't persist session on server
    },
  })
}
