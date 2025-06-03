// This file contains a browser-only Supabase client
// It's intentionally a .js file to avoid TypeScript issues with dynamic imports

let supabaseClient = null

// Function to initialize the Supabase client only in the browser
export async function initSupabase() {
  // Only run in the browser
  if (typeof window === "undefined") return null

  // If we already have a client, return it
  if (supabaseClient) return supabaseClient

  // Dynamically import Supabase only on the client side
  const { createClient } = await import("@supabase/supabase-js")

  // Create the client with a unique storage key
  supabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: "casino-scheduler-auth-v5",
    },
  })

  return supabaseClient
}

// Function to get the Supabase client
export async function getSupabaseClient() {
  return await initSupabase()
}
