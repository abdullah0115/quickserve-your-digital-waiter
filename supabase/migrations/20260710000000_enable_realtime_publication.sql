-- REPLICA IDENTITY FULL alone does not enable realtime — a table also has to
-- be added to the `supabase_realtime` publication, or postgres_changes
-- subscribers never receive INSERT/UPDATE events (they only ever see fresh
-- data on next manual fetch/reload). This was missed in the initial schema,
-- silently breaking live orders (Dashboard KDS, live-order badge,
-- DisplayScreen) and the notification bell.
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
