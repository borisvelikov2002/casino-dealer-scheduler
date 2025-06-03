import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"

// Server-side Supabase client singleton
const serverSupabaseInstance: ReturnType<typeof createClient> | null = null

// Server-side Supabase client (used in Server Components)
export function createServerClient() {
  // For server components, we need to create a new client for each request
  // because cookies are request-specific
  const cookieStore = cookies()

  // Create a new client with the service role key
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: {
      persistSession: false, // Don't persist session on server
    },
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value
      },
    },
    global: {
      fetch: (...args) => fetch(...args),
    },
  })
}
