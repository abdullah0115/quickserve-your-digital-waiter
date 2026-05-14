// Server-style auth helper (not tied to TanStack Start). Use from API routes or server handlers.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { JwtPayload } from '@supabase/supabase-js'
import type { Database } from './types'

export interface SupabaseAuthContext {
  supabase: SupabaseClient<Database>
  userId: string
  claims: JwtPayload
}

/**
 * Validates `Authorization: Bearer <jwt>` and returns a Supabase client plus JWT claims.
 * Throws `Response` with 401/500 on failure (same contract as typical HTTP middleware).
 */
export async function requireSupabaseAuthFromRequest(
  request: Request
): Promise<SupabaseAuthContext> {
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Response(
      'Missing Supabase environment variables. Ensure SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are set.',
      { status: 500 }
    )
  }

  const authHeader = request.headers.get('authorization')

  if (!authHeader) {
    throw new Response('Unauthorized: No authorization header provided', { status: 401 })
  }

  if (!authHeader.startsWith('Bearer ')) {
    throw new Response('Unauthorized: Only Bearer tokens are supported', { status: 401 })
  }

  const token = authHeader.slice('Bearer '.length).trim()
  if (!token) {
    throw new Response('Unauthorized: No token provided', { status: 401 })
  }

  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const { data, error } = await supabase.auth.getClaims(token)
  if (error || !data?.claims) {
    throw new Response('Unauthorized: Invalid token', { status: 401 })
  }

  if (!data.claims.sub) {
    throw new Response('Unauthorized: No user ID found in token', { status: 401 })
  }

  return {
    supabase,
    userId: data.claims.sub,
    claims: data.claims,
  }
}
