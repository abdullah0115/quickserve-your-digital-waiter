import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { WifiOff } from 'lucide-react'
import { useOfflineSync } from '@/hooks/useOfflineSync'

export function OfflineIndicator() {
  const { isOnline } = useOfflineSync()
  const [show, setShow] = useState(false)

  useEffect(() => {
    setShow(!isOnline)
  }, [isOnline])

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          className="fixed top-0 left-0 right-0 z-50"
        >
          <div className="bg-destructive text-destructive-foreground py-2 px-4 text-center text-sm font-medium">
            <div className="flex items-center justify-center gap-2">
              <WifiOff className="w-4 h-4 animate-pulse" />
              <span>You're offline. Please reconnect to place an order.</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}