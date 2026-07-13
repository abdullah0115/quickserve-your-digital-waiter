import { Link, useNavigate } from "react-router-dom";
import { Coffee, Menu as MenuIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";

export function MarketingNav() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border/50">
      <div className="container mx-auto px-4 lg:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-coffee flex items-center justify-center shadow-soft group-hover:shadow-warm transition-shadow">
            <Coffee className="w-5 h-5 text-accent" strokeWidth={2.5} />
          </div>
          <span className="font-display text-xl font-bold tracking-tight">QuickWaiterz</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          <Link to="/" className="text-sm font-medium text-muted-foreground hover:text-foreground transition">Home</Link>
          <Link to="/pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground transition">Pricing</Link>
          <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition">Features</a>
        </nav>

        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <Button onClick={() => navigate("/dashboard")} className="bg-primary hover:bg-primary-hover text-primary-foreground">
              Dashboard
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => navigate("/auth")}>Sign In</Button>
              <Button onClick={() => navigate("/auth?mode=signup")} className="bg-primary hover:bg-primary-hover text-primary-foreground">
                Start Free Trial
              </Button>
            </>
          )}
        </div>

        <button className="md:hidden" onClick={() => setOpen(!open)} aria-label="menu">
          {open ? <X /> : <MenuIcon />}
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t bg-background">
          <div className="container mx-auto px-4 py-4 flex flex-col gap-3">
            <Link to="/" onClick={() => setOpen(false)} className="py-2">Home</Link>
            <Link to="/pricing" onClick={() => setOpen(false)} className="py-2">Pricing</Link>
            {user ? (
              <Button onClick={() => navigate("/dashboard")} className="w-full">Dashboard</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => navigate("/auth")} className="w-full">Sign In</Button>
                <Button onClick={() => navigate("/auth?mode=signup")} className="w-full bg-primary text-primary-foreground">Start Free Trial</Button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t bg-muted/30 mt-24">
      <div className="container mx-auto px-4 lg:px-8 py-12 grid md:grid-cols-5 gap-8">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-coffee flex items-center justify-center">
              <Coffee className="w-4 h-4 text-accent" />
            </div>
            <span className="font-display text-lg font-bold">QuickWaiterz</span>
          </div>
          <p className="text-sm text-muted-foreground max-w-md">
            The smart QR ordering and queue management system for modern cafes and restaurants.
          </p>
        </div>
        <div>
          <h4 className="font-semibold mb-3 text-sm">Product</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link to="/pricing" className="hover:text-foreground">Pricing</Link></li>
            <li><a href="#features" className="hover:text-foreground">Features</a></li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold mb-3 text-sm">Company</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><a href="#" className="hover:text-foreground">About</a></li>
            <li><a href="#" className="hover:text-foreground">Contact</a></li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold mb-3 text-sm">Legal</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link to="/privacy" className="hover:text-foreground">Privacy Policy</Link></li>
            <li><Link to="/terms" className="hover:text-foreground">Terms of Service</Link></li>
            <li><Link to="/refund" className="hover:text-foreground">Refund Policy</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t">
        <div className="container mx-auto px-4 py-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} QuickWaiterz. Crafted with care.
        </div>
      </div>
    </footer>
  );
}
