import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/integrations/supabase/client'
import type { Database, Json } from '@/integrations/supabase/types'
import { 
  getPendingOrders, 
  markOrderSynced, 
  incrementSyncAttempts, 
  addLocalNotification 
} from '@/lib/db'
import { toast } from 'sonner'

type OrderStatus = Database['public']['Enums']['order_status']

export function useOfflineSync(businessSlug?: string) {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [isSyncing, setIsSyncing] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 })

  // 1. Online/Offline Listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      toast.success('Back online! Syncing pending orders...')
      syncPendingOrders()
    }

    const handleOffline = () => {
      setIsOnline(false)
      toast.warning('You are offline. Orders will be queued locally.')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // 2. Poll for pending orders (Every 10 seconds)
  useEffect(() => {
    loadPendingCount()
    const interval = setInterval(loadPendingCount, 10000)
    return () => clearInterval(interval)
  }, [businessSlug])

  // 3. Auto-sync trigger
  useEffect(() => {
    if (isOnline && pendingCount > 0 && !isSyncing) {
      const timer = setTimeout(() => syncPendingOrders(), 2000)
      return () => clearTimeout(timer)
    }
  }, [isOnline, pendingCount, isSyncing])

  async function loadPendingCount() {
    const pending = await getPendingOrders(businessSlug)
    setPendingCount(pending.length)
  }

  const syncPendingOrders = useCallback(async () => {
    if (!isOnline || isSyncing) return

    setIsSyncing(true)

    try {
      const pendingOrders = await getPendingOrders(businessSlug)
      
      if (pendingOrders.length === 0) {
        setIsSyncing(false)
        return
      }

      setSyncProgress({ current: 0, total: pendingOrders.length })

      let successCount = 0
      let failCount = 0

      for (let i = 0; i < pendingOrders.length; i++) {
        const order = pendingOrders[i]
        
        try {
          setSyncProgress({ current: i + 1, total: pendingOrders.length })

          // Type safe status and data
          const status = (order.status ?? 'pending') as OrderStatus

          const { data, error } = await supabase
            .from('orders')
            .insert({
              business_id: order.businessId,
              token_number: order.tokenNumber,
              customer_name: order.customerName?.trim() || 'Guest',
              customer_phone: order.customerPhone ?? null,
              items: order.items as unknown as Json,
              total_amount: order.totalAmount,
              status: status,
              table_number: order.tableNumber ?? null,
              order_type: order.orderType,
              notes: order.notes ?? null,
              created_at: new Date(order.createdAt).toISOString(),
            })
            .select()
            .single()

          if (error) throw error

          // Mark as synced in IndexedDB/Local DB
          await markOrderSynced(order.localId)
          
          // Add notification for the UI
          if (addLocalNotification) {
            await addLocalNotification({
              type: 'order_completed',
              title: `Order #${order.tokenNumber} Synced`,
              message: 'Order successfully sent to server',
              tokenNumber: order.tokenNumber,
              orderId: data.id,
            })
          }

          successCount++
          playNotificationSound()

        } catch (error: any) {
          console.error('Failed to sync order:', order.localId, error)
          
          // Retry logic
          if (incrementSyncAttempts) {
            await incrementSyncAttempts(order.localId)
            if ((order.syncAttempts || 0) >= 2) { // 3rd attempt check
              toast.error(`Order #${order.tokenNumber} sync failed repeatedly.`)
            }
          }
          
          failCount++
        }

        // Small delay to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      if (successCount > 0) {
        toast.success(`✅ ${successCount} order(s) synced successfully!`)
      }
      
      if (failCount > 0) {
        toast.error(`❌ ${failCount} order(s) failed. Will retry.`)
      }

      loadPendingCount() // Update count after loop
      setSyncProgress({ current: 0, total: 0 })
    } catch (error) {
      console.error('Sync error:', error)
      toast.error('Sync process encountered an error.')
    } finally {
      setIsSyncing(false)
    }
  }, [isOnline, isSyncing, businessSlug])

  return {
    isOnline,
    isSyncing,
    pendingCount,
    syncProgress,
    syncPendingOrders,
  }
}

// Sound Helper
function playNotificationSound() {
  try {
    const audio = new Audio('/notification.mp3')
    audio.volume = 0.4
    audio.play().catch(() => {})
  } catch (e) {
    // Ignore sound errors
  }
}