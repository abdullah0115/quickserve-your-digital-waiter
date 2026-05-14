import { useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import type { Json } from '@/integrations/supabase/types'
import { savePendingOrder } from '@/lib/db'
import { useOfflineSync } from './useOfflineSync'
import { toast } from 'sonner'

interface OrderItem {
  menu_item_id: string
  name: string
  quantity: number
  price: number
  notes?: string
}

interface CreateOrderData {
  businessId: string
  businessSlug: string
  customerName?: string
  customerPhone?: string
  items: OrderItem[]
  totalAmount: number
  tableNumber?: string
  orderType: 'dine_in' | 'takeaway'
  notes?: string
}

export function useCreateOrder(businessSlug?: string) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { isOnline } = useOfflineSync(businessSlug)

  async function getNextTokenNumber(businessId: string): Promise<number> {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { data } = await supabase
      .from('orders')
      .select('token_number')
      .eq('business_id', businessId)
      .gte('created_at', today.toISOString())
      .order('token_number', { ascending: false })
      .limit(1)
      .maybeSingle()

    return (data?.token_number || 0) + 1
  }

  async function createOrder(orderData: CreateOrderData) {
    setIsSubmitting(true)

    try {
      const tokenNumber = await getNextTokenNumber(orderData.businessId)
      const localId = crypto.randomUUID()

      if (isOnline) {
        // Online: Direct Supabase
        const { data, error } = await supabase
          .from('orders')
          .insert({
            business_id: orderData.businessId,
            token_number: tokenNumber,
            customer_name: orderData.customerName?.trim() || 'Guest',
            customer_phone: orderData.customerPhone ?? null,
            items: orderData.items as unknown as Json,
            total_amount: orderData.totalAmount,
            status: 'pending',
            table_number: orderData.tableNumber ?? null,
            order_type: orderData.orderType,
            notes: orderData.notes ?? null,
          })
          .select()
          .single()

        if (error) throw error

        toast.success(`Order #${tokenNumber} placed successfully!`)
        return { ...data, localId }
      } else {
        // Offline: Save to IndexedDB
        await savePendingOrder({
          localId,
          businessId: orderData.businessId,
          businessSlug: orderData.businessSlug,
          tokenNumber,
          customerName: orderData.customerName,
          customerPhone: orderData.customerPhone,
          items: orderData.items,
          totalAmount: orderData.totalAmount,
          status: 'pending',
          tableNumber: orderData.tableNumber,
          orderType: orderData.orderType,
          notes: orderData.notes,
        })

        toast.success(`Order #${tokenNumber} saved offline! Will sync when online.`, {
          duration: 5000,
        })

        return {
          id: localId,
          token_number: tokenNumber,
          business_id: orderData.businessId,
          status: 'pending',
          offline: true,
        }
      }
    } catch (error: any) {
      console.error('Order creation error:', error)
      toast.error(error.message || 'Failed to create order')
      throw error
    } finally {
      setIsSubmitting(false)
    }
  }

  return {
    createOrder,
    isSubmitting,
    isOnline,
  }
}