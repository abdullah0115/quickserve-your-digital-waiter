import Dexie, { Table } from 'dexie'

export interface PendingOrder {
  id?: number
  localId: string
  businessId: string
  businessSlug: string
  tokenNumber: number
  customerName?: string
  customerPhone?: string
  items: any[]
  totalAmount: number
  status: string
  tableNumber?: string
  orderType: 'dine_in' | 'takeaway'
  notes?: string
  createdAt: number
  synced: boolean
  syncAttempts: number // Track retry attempts
  lastSyncAttempt?: number
}

export interface OrderQueue {
  id?: number
  orderId: string
  priority: number // 1 = highest
  status: 'pending' | 'processing' | 'completed' | 'failed'
  createdAt: number
  processedAt?: number
}

export interface CachedMenu {
  id?: number
  businessSlug: string
  menuData: any
  categoriesData: any
  cachedAt: number
  expiresAt: number
}

export interface CachedBusiness {
  id?: number
  businessSlug: string
  businessData: any
  cachedAt: number
  expiresAt: number
}

export interface LocalNotification {
  id?: number
  type: 'new_order' | 'order_ready' | 'order_completed'
  title: string
  message: string
  orderId?: string
  tokenNumber?: number
  isRead: boolean
  createdAt: number
}

class QuickWaiterzDB extends Dexie {
  pendingOrders!: Table<PendingOrder, number>
  orderQueue!: Table<OrderQueue, number>
  cachedMenu!: Table<CachedMenu, number>
  cachedBusiness!: Table<CachedBusiness, number>
  localNotifications!: Table<LocalNotification, number>

  constructor() {
    super('QuickWaiterzDB')
    
    this.version(2).stores({
      pendingOrders: '++id, localId, businessSlug, synced, createdAt, syncAttempts',
      orderQueue: '++id, orderId, status, priority, createdAt',
      cachedMenu: '++id, businessSlug, cachedAt',
      cachedBusiness: '++id, businessSlug, cachedAt',
      localNotifications: '++id, type, isRead, createdAt',
    })
  }
}

export const db = new QuickWaiterzDB()

// Enhanced Helper Functions

export async function savePendingOrder(order: Omit<PendingOrder, 'id' | 'synced' | 'createdAt' | 'syncAttempts'>) {
  const orderId = await db.pendingOrders.add({
    ...order,
    synced: false,
    createdAt: Date.now(),
    syncAttempts: 0,
  })
  
  // Add to queue with high priority
  await db.orderQueue.add({
    orderId: order.localId,
    priority: 1,
    status: 'pending',
    createdAt: Date.now(),
  })
  
  return orderId
}

export async function getPendingOrders(businessSlug?: string) {
  let orders = await db.pendingOrders
    .where('synced')
    .equals(0)
    .toArray()
  
  if (businessSlug) {
    orders = orders.filter(o => o.businessSlug === businessSlug)
  }
  
  // Sort by priority (newest first, then by sync attempts)
  return orders.sort((a, b) => {
    if (a.syncAttempts !== b.syncAttempts) {
      return a.syncAttempts - b.syncAttempts // Less attempts = higher priority
    }
    return b.createdAt - a.createdAt // Newer first
  })
}

export async function markOrderSynced(localId: string) {
  await db.pendingOrders
    .where('localId')
    .equals(localId)
    .modify({ synced: true })
  
  await db.orderQueue
    .where('orderId')
    .equals(localId)
    .modify({ status: 'completed', processedAt: Date.now() })
}

export async function incrementSyncAttempts(localId: string) {
  const order = await db.pendingOrders.where('localId').equals(localId).first()
  if (order) {
    await db.pendingOrders.update(order.id!, {
      syncAttempts: (order.syncAttempts || 0) + 1,
      lastSyncAttempt: Date.now(),
    })
  }
}

export async function addLocalNotification(notification: Omit<LocalNotification, 'id' | 'isRead' | 'createdAt'>) {
  return await db.localNotifications.add({
    ...notification,
    isRead: false,
    createdAt: Date.now(),
  })
}

export async function getUnreadNotifications() {
  return await db.localNotifications
    .where('isRead')
    .equals(0)
    .reverse()
    .sortBy('createdAt')
}

export async function markNotificationRead(id: number) {
  return await db.localNotifications.update(id, { isRead: true })
}

// Menu cache functions remain same
export async function cacheMenu(businessSlug: string, menuData: any, categoriesData: any) {
  const now = Date.now()
  
  await db.cachedMenu
    .where('businessSlug')
    .equals(businessSlug)
    .delete()
  
  return await db.cachedMenu.add({
    businessSlug,
    menuData,
    categoriesData,
    cachedAt: now,
    expiresAt: now + 24 * 60 * 60 * 1000,
  })
}

export async function getCachedMenu(businessSlug: string) {
  const cached = await db.cachedMenu
    .where('businessSlug')
    .equals(businessSlug)
    .first()
  
  if (!cached) return null
  
  if (Date.now() > cached.expiresAt) {
    await db.cachedMenu.delete(cached.id!)
    return null
  }
  
  return {
    menuItems: cached.menuData,
    categories: cached.categoriesData,
  }
}

export async function cacheBusiness(businessSlug: string, businessData: any) {
  const now = Date.now()
  
  await db.cachedBusiness
    .where('businessSlug')
    .equals(businessSlug)
    .delete()
  
  return await db.cachedBusiness.add({
    businessSlug,
    businessData,
    cachedAt: now,
    expiresAt: now + 7 * 24 * 60 * 60 * 1000,
  })
}

export async function getCachedBusiness(businessSlug: string) {
  const cached = await db.cachedBusiness
    .where('businessSlug')
    .equals(businessSlug)
    .first()
  
  if (!cached) return null
  
  if (Date.now() > cached.expiresAt) {
    await db.cachedBusiness.delete(cached.id!)
    return null
  }
  
  return cached.businessData
}