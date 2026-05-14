import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/integrations/supabase/client'
import type { Database, Json } from '@/integrations/supabase/types'
import { getPendingOrders, markOrderSynced } from '@/lib/db'
import { toast } from 'sonner'

type OrderStatus = Database['public']['Enums']['order_status']

export function useOfflineSync(businessSlug?: string) {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [isSyncing, setIsSyncing] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      toast.success('Back online! Syncing orders...')
      syncPendingOrders()
    }

    const handleOffline = () => {
      setIsOnline(false)
      toast.warning('You are offline. Orders will be saved locally.')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    loadPendingCount()
    const interval = setInterval(loadPendingCount, 10000)
    return () => clearInterval(interval)
  }, [businessSlug])

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
        return
      }

      let successCount = 0
      let failCount = 0

      for (const order of pendingOrders) {
        try {
          const status = (order.status ?? 'pending') as OrderStatus
          const { error } = await supabase.from('orders').insert({
            business_id: order.businessId,
            token_number: order.tokenNumber,
            customer_name: order.customerName?.trim() || 'Guest',
            customer_phone: order.customerPhone ?? null,
            items: order.items as unknown as Json,
            total_amount: order.totalAmount,
            status,
            table_number: order.tableNumber ?? null,
            order_type: order.orderType,
            notes: order.notes ?? null,
            created_at: new Date(order.createdAt).toISOString(),
          })

          if (error) throw error

          await markOrderSynced(order.localId)
          successCount++
        } catch (error) {
          console.error('Failed to sync order:', order.localId, error)
          failCount++
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount} order(s) synced!`)
      }
      
      if (failCount > 0) {
        toast.error(`${failCount} order(s) failed to sync`)
      }

      setPendingCount(failCount)
    } catch (error) {
      console.error('Sync error:', error)
      toast.error('Failed to sync orders')
    } finally {
      setIsSyncing(false)
    }
  }, [isOnline, isSyncing, businessSlug])

  useEffect(() => {
    if (isOnline && pendingCount > 0) {
      syncPendingOrders()
    }
  }, [isOnline, pendingCount, syncPendingOrders])

  return {
    isOnline,
    isSyncing,
    pendingCount,
    syncPendingOrders,
  }
}