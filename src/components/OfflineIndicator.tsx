import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { WifiOff, Wifi, Loader2 } from 'lucide-react'
import { useOfflineSync } from '@/hooks/useOfflineSync'

export function OfflineIndicator() {
  const { isOnline, isSyncing, pendingCount, syncProgress } = useOfflineSync()
  const [show, setShow] = useState(false)

  useEffect(() => {
    setShow(!isOnline || isSyncing || pendingCount > 0)
  }, [isOnline, isSyncing, pendingCount])

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          className="fixed top-0 left-0 right-0 z-50"
        >
          {!isOnline && (
            <div className="bg-destructive text-destructive-foreground py-2 px-4 text-center text-sm font-medium">
              <div className="flex items-center justify-center gap-2">
                <WifiOff className="w-4 h-4 animate-pulse" />
                <span>You're offline. Orders will be queued.</span>
                {pendingCount > 0 && (
                  <span className="bg-white/20 px-2 py-0.5 rounded">
                    {pendingCount} pending
                  </span>
                )}
              </div>
            </div>
          )}

          {isOnline && isSyncing && (
            <div className="bg-secondary text-secondary-foreground py-2 px-4 text-center text-sm font-medium">
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>
                  Syncing orders... {syncProgress.current}/{syncProgress.total}
                </span>
              </div>
            </div>
          )}

          {isOnline && !isSyncing && pendingCount > 0 && (
            <div className="bg-accent text-accent-foreground py-2 px-4 text-center text-sm font-medium">
              <div className="flex items-center justify-center gap-2">
                <Wifi className="w-4 h-4" />
                <span>{pendingCount} order(s) waiting to sync</span>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}