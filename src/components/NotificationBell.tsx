import { useEffect } from 'react'
import { Bell } from 'lucide-react'
import { Button } from './ui/button'
import { useNotifications } from '@/hooks/useNotifications'
import { useAuth } from '@/hooks/useAuth'
import { Badge } from './ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { format } from 'date-fns'
import { unlockNotificationAudio } from '@/lib/notificationSound'

export function NotificationBell() {
  const { businessId } = useAuth()
  const { notifications, unreadCount, markAsRead } = useNotifications(undefined, businessId ?? undefined)

  // Browsers block audio until there's been a real user gesture on the page.
  // Unlock it on the first click/keypress so it's already running by the
  // time a realtime notification tries to play a sound of its own accord.
  useEffect(() => {
    const unlock = () => unlockNotificationAudio()
    document.addEventListener('pointerdown', unlock, { once: true })
    document.addEventListener('keydown', unlock, { once: true })
    return () => {
      document.removeEventListener('pointerdown', unlock)
      document.removeEventListener('keydown', unlock)
    }
  }, [])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-destructive text-[10px]">
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent align="end" className="w-80">
        <div className="px-3 py-2 border-b">
          <h3 className="font-semibold">Notifications</h3>
        </div>
        
        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              No notifications
            </div>
          ) : (
            notifications.slice(0, 10).map((notif) => (
              <DropdownMenuItem
                key={notif.id}
                className="px-3 py-3 cursor-pointer"
                onClick={() => markAsRead(notif.id)}
              >
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-sm">{notif.title}</p>
                    {!notif.is_read && (
                      <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {notif.message}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(notif.created_at), 'MMM d, h:mm a')}
                  </p>
                </div>
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}