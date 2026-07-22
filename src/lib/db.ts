import Dexie, { Table } from 'dexie'

// One queued order per business per device at a time (enforced by callers,
// not the schema) — created when a real submit attempt fails for network
// reasons while the customer is mid-order. `items`/`estimatedTotal` are for
// showing the customer what they're waiting to send; the server always
// recomputes the real total from live menu prices on sync, same as a normal
// online order — nothing here is ever trusted as authoritative.
export interface PendingOrder {
  id?: number
  localId: string
  businessId: string
  businessSlug: string
  qrCodeId: string | null
  customerName: string
  customerPhone?: string
  items: Array<{ menuItemId: string; name: string; price: number; quantity: number; notes?: string }>
  estimatedTotal: number
  orderType: 'dine_in' | 'takeaway'
  notes?: string
  createdAt: number
  synced: boolean
  syncAttempts: number
  lastSyncAttempt?: number
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
  cachedMenu!: Table<CachedMenu, number>
  cachedBusiness!: Table<CachedBusiness, number>
  localNotifications!: Table<LocalNotification, number>

  constructor() {
    super('QuickWaiterzDB')

    // v2 also had an `orderQueue` store from an earlier, unshipped attempt
    // at this feature — dead (its only writer was deleted, nothing ever
    // wrote a row to it, and pendingOrders' own `synced`/`syncAttempts`
    // fields already cover what it tracked). localNotifications is real —
    // useNotifications.ts reads/writes it as an offline fallback cache —
    // so it's carried forward unchanged.
    this.version(2).stores({
      pendingOrders: '++id, localId, businessSlug, synced, createdAt, syncAttempts',
      orderQueue: '++id, orderId, status, priority, createdAt',
      cachedMenu: '++id, businessSlug, cachedAt',
      cachedBusiness: '++id, businessSlug, cachedAt',
      localNotifications: '++id, type, isRead, createdAt',
    })

    this.version(3).stores({
      pendingOrders: '++id, localId, businessSlug, synced, createdAt, syncAttempts',
      orderQueue: null,
      cachedMenu: '++id, businessSlug, cachedAt',
      cachedBusiness: '++id, businessSlug, cachedAt',
      localNotifications: '++id, type, isRead, createdAt',
    })
  }
}

export const db = new QuickWaiterzDB()

// Offline order queue

export async function queueOfflineOrder(order: Omit<PendingOrder, 'id' | 'synced' | 'createdAt' | 'syncAttempts'>) {
  return db.pendingOrders.add({
    ...order,
    synced: false,
    createdAt: Date.now(),
    syncAttempts: 0,
  })
}

// One business + one device = at most one pending order, so this is a
// point lookup, not a list — simpler for callers than reasoning about which
// of several to show.
export async function getPendingOrder(businessSlug: string) {
  return (
    (await db.pendingOrders
      .where('businessSlug')
      .equals(businessSlug)
      .and((o) => !o.synced)
      .first()) ?? null
  )
}

export async function incrementSyncAttempts(localId: string) {
  await db.pendingOrders.where('localId').equals(localId).modify((o) => {
    o.syncAttempts += 1
    o.lastSyncAttempt = Date.now()
  })
}

// Called once the order has actually reached the server — at that point
// there's nothing left to retry, so the row is removed rather than kept
// around marked `synced: true` (no UI ever lists past queued orders).
export async function deletePendingOrder(localId: string) {
  await db.pendingOrders.where('localId').equals(localId).delete()
}

// Local notification cache (offline fallback for useNotifications.ts)

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

// Menu cache functions

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
