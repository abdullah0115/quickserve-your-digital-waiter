import { Routes, Route, useNavigate } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "./integrations/supabase/client";

const Home = lazy(() => import("./pages/Home"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const Refund = lazy(() => import("./pages/Refund"));
const BusinessLanding = lazy(() => import("./pages/BusinessLanding"));
const Menu = lazy(() => import("./pages/Menu"));
const OrderStatus = lazy(() => import("./pages/OrderStatus"));
const DisplayScreen = lazy(() => import("./pages/DisplayScreen"));
import { OfflineIndicator } from "./components/OfflineIndicator"

;

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-accent" />
    </div>
  );
}

export default function App() {
  const navigate = useNavigate();

  // Supabase's own `redirectTo` for password-recovery links isn't reliably
  // honored (it can silently fall back to the bare site URL instead of
  // /auth/reset-password) — so instead of depending on that, catch the
  // PASSWORD_RECOVERY event globally, no matter which page the recovery
  // link happened to land the browser on, and route from here.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") navigate("/auth/reset-password", { replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  return (
    <Suspense fallback={<PageLoader />}>
      <OfflineIndicator />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/auth/reset-password" element={<ResetPassword />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/dashboard/*" element={<Dashboard />} />
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/refund" element={<Refund />} />
        <Route path="/:slug" element={<BusinessLanding />} />
        <Route path="/:slug/menu" element={<Menu />} />
        <Route path="/:slug/order/:token" element={<OrderStatus />} />
        <Route path="/:slug/display" element={<DisplayScreen />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}