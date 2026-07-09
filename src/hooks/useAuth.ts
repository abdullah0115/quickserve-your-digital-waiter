import { useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/integrations/supabase/client'
import type { Database } from '@/integrations/supabase/types'

type AppRole = Database['public']['Enums']['app_role']

export interface UserRoleRow {
  id: string
  business_id: string | null
  role: AppRole
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [roles, setRoles] = useState<UserRoleRow[]>([])
  const [loading, setLoading] = useState(true)

  async function loadRoles(userId: string) {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('id, business_id, role')
        .eq('user_id', userId)

      if (error) throw error
      setRoles(data ?? [])
    } catch (error) {
      console.error('Error loading user roles:', error)
      setRoles([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // CRITICAL: Subscribe FIRST to avoid missing real-time session switches
    const { data: sub } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession)
      setUser(currentSession?.user ?? null)

      if (currentSession?.user) {
        loadRoles(currentSession.user.id)
      } else {
        setRoles([])
        setLoading(false)
      }
    })

    // Fetch initial fallback session data safely
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession)
      setUser(initialSession?.user ?? null)

      if (initialSession?.user) {
        loadRoles(initialSession.user.id)
      } else {
        setLoading(false)
      }
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  // A user currently has at most one business via the onboarding flow
  // (owner) or an invite (staff) — take the first role's business.
  const businessId = roles.find((r) => r.business_id)?.business_id ?? null
  const isOwner = roles.some((r) => r.role === 'owner')
  const isStaff = roles.some((r) => r.role === 'staff')

  // There's no granular per-permission system yet — owners and staff both
  // get full dashboard access at the RLS layer (see user_roles / is_business_member
  // in the schema). These flags are here for UI-level gating if that's ever added.
  const canEditMenu = isOwner || isStaff
  const canViewOrders = isOwner || isStaff
  const canChangeOrderStatus = isOwner || isStaff

  async function signOut() {
    setLoading(true)
    await supabase.auth.signOut()
  }

  return {
    session,
    user,
    roles,
    businessId,
    loading,
    canEditMenu,
    canViewOrders,
    canChangeOrderStatus,
    isOwner,
    isStaff,
    signOut,
  }
}
