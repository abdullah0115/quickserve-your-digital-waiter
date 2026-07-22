import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { getCachedMenu, cacheMenu, getCachedBusiness, cacheBusiness } from '@/lib/db'
import { toast } from 'sonner'

export interface Business {
  id: string; name: string; slug: string
  cover_image_url: string | null; cuisine_type: string | null; city: string | null; address: string | null
}
export interface Cat { id: string; name: string; display_order: number }
export interface Item {
  id: string; name: string; description: string | null; price: number
  category_id: string | null; image_url: string | null; is_available: boolean; is_featured: boolean
}

// Fetches business + menu for the given slug, caching every successful
// online fetch (IndexedDB, via src/lib/db.ts) so a customer who reloads
// the page with no connectivity still sees the menu they were just
// looking at, instead of a dead-end "business not found". Only browsing
// works offline this way — placing an order still needs a real network
// round trip at some point (see useOfflineOrderQueue for that half).
export function useOfflineMenu(businessSlug: string) {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [menuItems, setMenuItems] = useState<Item[]>([])
  const [categories, setCategories] = useState<Cat[]>([])
  const [business, setBusiness] = useState<Business | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isFromCache, setIsFromCache] = useState(false)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const loadFromCache = useCallback(async (announce: 'silent' | 'info' | 'warning') => {
    const cachedBiz = await getCachedBusiness(businessSlug)
    const cachedMenuData = await getCachedMenu(businessSlug)

    if (cachedBiz) setBusiness(cachedBiz)
    if (cachedMenuData) {
      setMenuItems(cachedMenuData.menuItems)
      setCategories(cachedMenuData.categories)
      setIsFromCache(true)
      if (announce === 'info') toast.info('Viewing offline menu', { duration: 2000 })
      if (announce === 'warning') toast.warning('Loaded from offline cache')
    } else if (announce !== 'silent') {
      toast.error('No offline data available — please reconnect and reload.')
    }
    return { hasBiz: !!cachedBiz, hasMenu: !!cachedMenuData }
  }, [businessSlug])

  const loadMenuData = useCallback(async () => {
    if (!businessSlug) { setIsLoading(false); return }
    setIsLoading(true)

    try {
      if (isOnline) {
        const { data: biz, error: bizError } = await supabase
          .from('businesses')
          .select('id,name,slug,cover_image_url,cuisine_type,city,address')
          .eq('slug', businessSlug)
          .maybeSingle()

        if (bizError || !biz) {
          // navigator.onLine said we're online but the request itself
          // failed (or genuinely no such business) - fall back to
          // whatever's cached rather than a hard dead end.
          await loadFromCache('silent')
          return
        }

        const [categoriesRes, itemsRes] = await Promise.all([
          supabase.from('menu_categories').select('*').eq('business_id', biz.id).eq('is_active', true).order('display_order'),
          supabase.from('menu_items').select('*').eq('business_id', biz.id).order('display_order'),
        ])

        setBusiness(biz)
        setCategories((categoriesRes.data ?? []) as Cat[])
        setMenuItems((itemsRes.data ?? []) as Item[])
        setIsFromCache(false)
        await cacheBusiness(businessSlug, biz)
        await cacheMenu(businessSlug, itemsRes.data ?? [], categoriesRes.data ?? [])
      } else {
        await loadFromCache('info')
      }
    } catch (error) {
      console.error('Error loading menu:', error)
      await loadFromCache('warning')
    } finally {
      setIsLoading(false)
    }
  }, [businessSlug, isOnline, loadFromCache])

  useEffect(() => {
    loadMenuData()
  }, [loadMenuData])

  return {
    business,
    menuItems,
    categories,
    isLoading,
    isOnline,
    isFromCache,
    reload: loadMenuData,
  }
}
