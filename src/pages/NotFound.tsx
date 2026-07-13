import { Link } from "react-router-dom";
import { Coffee, Home as HomeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";

export default function NotFound() {
  return (
    <>
      <SEO title="Page Not Found — QuickWaiterz" description="The page you're looking for doesn't exist." noIndex />
      <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-hero pattern-warm">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-coffee flex items-center justify-center shadow-warm">
            <Coffee className="w-10 h-10 text-accent" />
          </div>
          <h1 className="font-display text-7xl font-bold mb-3">404</h1>
          <h2 className="font-display text-2xl font-semibold mb-3">We couldn't find that page</h2>
          <p className="text-muted-foreground mb-8">
            The page you're looking for might have been moved or doesn't exist.
          </p>
          <Link to="/">
            <Button size="lg" className="bg-primary hover:bg-primary-hover text-primary-foreground">
              <HomeIcon className="w-4 h-4 mr-2" /> Back to Home
            </Button>
          </Link>
        </div>
      </div>
    </>
  );
}
