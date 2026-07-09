import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { addLocalNotification, getUnreadNotifications } from '@/lib/db'
import { playNotificationSound } from '@/lib/notificationSound'

// Explicit Fallback Type Definition to bypass missing generated table keys
export type NotificationRow = {
  id: string
  user_id: string | null
  business_id: string | null
  title: string | null
  message: string | null
  type: string // Generic string from DB
  is_read: boolean
  order_id: string | null
  data: any | null
  created_at: string
}

export function useNotifications(userId?: string, businessId?: string) {
  const [notifications, setNotifications] = useState<NotificationRow[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  // Memoized load function to prevent unnecessary recreation
  const loadNotifications = useCallback(async () => {
    try {
      // 1. Online Network Fetch
      if (navigator.onLine) {
        let query = supabase
          .from('notifications')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50)

        if (userId) {
          query = query.eq('user_id', userId)
        } else if (businessId) {
          query = query.eq('business_id', businessId)
        }

        const { data, error } = await query

        if (error) throw error

        if (data) {
          setNotifications(data as NotificationRow[])
          setUnreadCount(data.filter((n: any) => !n.is_read).length)
          return
        }
      }

      // 2. Offline Mode Cache Fallback (IndexedDB)
      if (getUnreadNotifications) {
        const localNotifs = await getUnreadNotifications()
        setNotifications(localNotifs as unknown as NotificationRow[])
        setUnreadCount(localNotifs.length)
      }
    } catch (error) {
      console.error('Error loading notifications:', error)
    }
  }, [userId, businessId])

  useEffect(() => {
    if (!userId && !businessId) return

    loadNotifications()
    
    // Realtime Postgres Change Filtering Rules
    const filterQuery = userId 
      ? `user_id=eq.${userId}` 
      : `business_id=eq.${businessId}`

    const channel = supabase
      .channel(`notifications-${userId ?? businessId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: filterQuery,
        },
        async (payload) => {
          const newNotif = payload.new as NotificationRow
          
          // Local Database Sync with specific type-casting to fix Error 2322
          if (addLocalNotification) {
            await addLocalNotification({
              type: newNotif.type as any, // FIXED: Bypasses strict LocalNotification type mapping
              title: newNotif.title || 'New Notification',
              message: newNotif.message || '',
              orderId: newNotif.order_id || undefined,
              tokenNumber: newNotif.data?.token_number || undefined,
            })
          }

          // UI Alerts & Feedbacks
          toast.info(newNotif.title || 'Notification Received', {
            description: newNotif.message,
            duration: 5000,
          })

          playNotificationSound()

          // Browser System Native Push
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(newNotif.title || 'New Update', {
              body: newNotif.message || '',
              icon: '/pwa-192x192.png',
              badge: '/pwa-192x192.png',
            })
          }

          loadNotifications()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, businessId, loadNotifications])

  // Update read status handler
  async function markAsRead(notificationId: string) {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId)

      if (error) throw error

      loadNotifications()
    } catch (error) {
      console.error('Error marking notification as read:', error)
    }
  }

  // Permission request API for System UI Notifications
  async function requestPermission() {
    if ('Notification' in window) {
      if (Notification.permission === 'default') {
        const permission = await Notification.requestPermission()
        return permission === 'granted'
      }
      return Notification.permission === 'granted'
    }
    return false
  }

  return {
    notifications,
    unreadCount,
    markAsRead,
    requestPermission,
    reload: loadNotifications,
  }
}