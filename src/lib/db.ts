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

class QuickServeDB extends Dexie {
  pendingOrders!: Table<PendingOrder, number>
  cachedMenu!: Table<CachedMenu, number>
  cachedBusiness!: Table<CachedBusiness, number>

  constructor() {
    super('QuickServeDB')
    
    this.version(1).stores({
      pendingOrders: '++id, localId, businessSlug, synced, createdAt',
      cachedMenu: '++id, businessSlug, cachedAt',
      cachedBusiness: '++id, businessSlug, cachedAt',
    })
  }
}

export const db = new QuickServeDB()

// Helper Functions

export async function savePendingOrder(order: Omit<PendingOrder, 'id' | 'synced' | 'createdAt'>) {
  return await db.pendingOrders.add({
    ...order,
    synced: false,
    createdAt: Date.now(),
  })
}

export async function getPendingOrders(businessSlug?: string) {
  let orders = await db.pendingOrders
    .where('synced')
    .equals(0)
    .toArray()
  
  if (businessSlug) {
    orders = orders.filter(o => o.businessSlug === businessSlug)
  }
  
  return orders
}

export async function markOrderSynced(localId: string) {
  return await db.pendingOrders
    .where('localId')
    .equals(localId)
    .modify({ synced: true })
}

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
    expiresAt: now + 24 * 60 * 60 * 1000, // 24 hours
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
    expiresAt: now + 7 * 24 * 60 * 60 * 1000, // 7 days
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