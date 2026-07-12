import { useEffect, useState } from 'react'
import { toast } from 'sonner'

// Tracks browser online/offline state for the OfflineIndicator banner.
// (There used to be an offline order-queue/sync mechanism here too, but its
// only writer — useCreateOrder — had zero call sites; the live order flow
// goes through the create-order edge function directly, with no offline
// queue. Removed rather than patched, since it could never have anything
// to sync.)
export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      toast.success('Back online!')
    }

    const handleOffline = () => {
      setIsOnline(false)
      toast.warning('You are offline.')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return { isOnline }
}
