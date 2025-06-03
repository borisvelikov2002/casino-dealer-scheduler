import { createClient } from "@supabase/supabase-js"
import type { SupabaseClient } from "@supabase/supabase-js"

// Singleton pattern for Supabase client
class SupabaseSingleton {
  private static instance: SupabaseClient | null = null
  private static isInitializing = false
  private static initPromise: Promise<SupabaseClient> | null = null

  private constructor() {
    // Private constructor to prevent direct construction calls
  }

  public static getInstance(): SupabaseClient {
    // For server-side rendering, create a new instance each time
    if (typeof window === "undefined") {
      return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: {
          persistSession: false,
        },
      })
    }

    // If we already have an instance, return it
    if (this.instance) {
      return this.instance
    }

    // If we're already initializing, return the promise
    if (this.initPromise) {
      // Return a dummy client that will be replaced once initialization completes
      return {
        from: () => ({
          select: () => ({ data: null, error: new Error("Supabase client is initializing") }),
          insert: () => ({ data: null, error: new Error("Supabase client is initializing") }),
          update: () => ({ data: null, error: new Error("Supabase client is initializing") }),
          delete: () => ({ data: null, error: new Error("Supabase client is initializing") }),
        }),
      } as any
    }

    // Set flag to prevent recursive initialization
    this.isInitializing = true

    // Create initialization promise
    this.initPromise = new Promise((resolve) => {
      try {
        // Create a new instance
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

        if (!supabaseUrl || !supabaseAnonKey) {
          console.error("Supabase environment variables are missing")
        }

        this.instance = createClient(supabaseUrl, supabaseAnonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
            storageKey: "casino-scheduler-auth-v7",
          },
        })

        resolve(this.instance)
      } catch (error) {
        console.error("Error initializing Supabase client:", error)
        // Create a minimal client that will return errors
        this.instance = {
          from: () => ({
            select: () => ({ data: null, error: new Error("Failed to initialize Supabase client") }),
            insert: () => ({ data: null, error: new Error("Failed to initialize Supabase client") }),
            update: () => ({ data: null, error: new Error("Failed to initialize Supabase client") }),
            delete: () => ({ data: null, error: new Error("Failed to initialize Supabase client") }),
          }),
        } as any

        resolve(this.instance)
      } finally {
        // Reset flags
        this.isInitializing = false
        this.initPromise = null
      }
    })

    return (
      this.instance ||
      ({
        from: () => ({
          select: () => ({ data: null, error: new Error("Supabase client not available") }),
          insert: () => ({ data: null, error: new Error("Supabase client not available") }),
          update: () => ({ data: null, error: new Error("Supabase client not available") }),
          delete: () => ({ data: null, error: new Error("Supabase client not available") }),
        }),
      } as any)
    )
  }
}

// Export a function to get the Supabase client
export function getSupabase(): SupabaseClient {
  return SupabaseSingleton.getInstance()
}

// Export the singleton instance directly
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
