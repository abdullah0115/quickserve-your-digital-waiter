import { useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/integrations/supabase/client'

// Safe fallbacks to prevent generated type errors
export interface UserProfile {
  id: string
  email: string
  full_name?: string
  role: 'owner' | 'staff' | 'customer'
  business_id?: string
  phone?: string
}

export interface BusinessMember {
  role: 'owner' | 'staff'
  permissions: {
    can_edit_menu: boolean
    can_view_orders: boolean
    can_change_status: boolean
  }
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [businessMember, setBusinessMember] = useState<BusinessMember | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(userId: string) {
    try {
      // (supabase as any) used to prevent table overload/missing type crashes
      const { data: profileData, error: profileError } = await (supabase as any)
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (profileError) throw profileError

      if (profileData) {
        setProfile(profileData as UserProfile)

        // If user is linked to a business, fetch member roles/permissions
        if (profileData.business_id) {
          const { data: memberData, error: memberError } = await (supabase as any)
            .from('business_members')
            .select('role, permissions')
            .eq('user_id', userId)
            .eq('business_id', profileData.business_id)
            .maybeSingle()

          if (memberError) throw memberError
          setBusinessMember(memberData as BusinessMember)
        }
      }
    } catch (error) {
      console.error('Error loading profile or permissions:', error)
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
        loadProfile(currentSession.user.id)
      } else {
        setProfile(null)
        setBusinessMember(null)
        setLoading(false)
      }
    })

    // Fetch initial fallback session data safely
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession)
      setUser(initialSession?.user ?? null)
      
      if (initialSession?.user) {
        loadProfile(initialSession.user.id)
      } else {
        setLoading(false)
      }
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  // Explicit type-safe getters for roles and features protection
  const canEditMenu = 
    businessMember?.role === 'owner' || 
    businessMember?.permissions?.can_edit_menu === true

  const canViewOrders = 
    businessMember?.role === 'owner' || 
    businessMember?.permissions?.can_view_orders === true

  const canChangeOrderStatus = 
    businessMember?.role === 'owner' || 
    businessMember?.permissions?.can_change_status === true

  const isOwner = businessMember?.role === 'owner'
  const isStaff = businessMember?.role === 'staff'

  async function signOut() {
    setLoading(true)
    await supabase.auth.signOut()
  }

  return {
    session,
    user,
    profile,
    businessMember,
    loading,
    canEditMenu,
    canViewOrders,
    canChangeOrderStatus,
    isOwner,
    isStaff,
    signOut,
  }
}