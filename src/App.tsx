import { Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

const Home = lazy(() => import("./pages/Home"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Auth = lazy(() => import("./pages/Auth"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const NotFound = lazy(() => import("./pages/NotFound"));
const BusinessLanding = lazy(() => import("./pages/BusinessLanding"));
const Menu = lazy(() => import("./pages/Menu"));
const OrderStatus = lazy(() => import("./pages/OrderStatus"));
const DisplayScreen = lazy(() => import("./pages/DisplayScreen"));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-accent" />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/dashboard/*" element={<Dashboard />} />
        <Route path="/:slug" element={<BusinessLanding />} />
        <Route path="/:slug/menu" element={<Menu />} />
        <Route path="/:slug/order/:token" element={<OrderStatus />} />
        <Route path="/:slug/display" element={<DisplayScreen />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}