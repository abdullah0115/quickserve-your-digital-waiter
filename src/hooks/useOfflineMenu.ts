import { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { getCachedMenu, cacheMenu, getCachedBusiness, cacheBusiness } from '@/lib/db'
import { toast } from 'sonner'

export function useOfflineMenu(businessSlug: string) {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [menuItems, setMenuItems] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [business, setBusiness] = useState<any>(null)
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

  useEffect(() => {
    loadMenuData()
  }, [businessSlug, isOnline])

  async function loadMenuData() {
    setIsLoading(true)

    try {
      if (isOnline) {
        // Online: Fetch from Supabase
        const [businessRes, menuRes, categoriesRes] = await Promise.all([
          supabase.from('businesses').select('*').eq('slug', businessSlug).single(),
          supabase.from('menu_items').select('*').eq('business_id', businessSlug).eq('is_available', true),
          supabase.from('menu_categories').select('*').eq('business_id', businessSlug).eq('is_active', true),
        ])

        if (businessRes.data) {
          setBusiness(businessRes.data)
          await cacheBusiness(businessSlug, businessRes.data)
        }

        if (menuRes.data && categoriesRes.data) {
          setMenuItems(menuRes.data)
          setCategories(categoriesRes.data)
          await cacheMenu(businessSlug, menuRes.data, categoriesRes.data)
          setIsFromCache(false)
        }
      } else {
        // Offline: Load from cache
        const cachedBiz = await getCachedBusiness(businessSlug)
        const cachedMenuData = await getCachedMenu(businessSlug)

        if (cachedBiz) {
          setBusiness(cachedBiz)
        }

        if (cachedMenuData) {
          setMenuItems(cachedMenuData.menuItems)
          setCategories(cachedMenuData.categories)
          setIsFromCache(true)
          toast.info('Viewing offline menu', { duration: 2000 })
        } else {
          toast.error('No offline data available. Please connect to internet.')
        }
      }
    } catch (error) {
      console.error('Error loading menu:', error)
      
      // Try cache on error
      const cachedBiz = await getCachedBusiness(businessSlug)
      const cachedMenuData = await getCachedMenu(businessSlug)

      if (cachedBiz) setBusiness(cachedBiz)
      if (cachedMenuData) {
        setMenuItems(cachedMenuData.menuItems)
        setCategories(cachedMenuData.categories)
        setIsFromCache(true)
        toast.warning('Loaded from offline cache')
      }
    } finally {
      setIsLoading(false)
    }
  }

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