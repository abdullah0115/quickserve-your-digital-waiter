import { Component, type ErrorInfo, type ReactNode } from "react";
import { Coffee, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// Top-level safety net for the whole app (see main.tsx) — without this, an
// unhandled render error anywhere (customer-facing Menu/OrderStatus
// included) unmounts the entire React tree and leaves a blank white page
// with no way to recover short of the user knowing to hit refresh.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled error in app tree:", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-hero pattern-warm">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-coffee flex items-center justify-center shadow-warm">
            <Coffee className="w-10 h-10 text-accent" />
          </div>
          <h1 className="font-display text-2xl font-semibold mb-3">Something went wrong</h1>
          <p className="text-muted-foreground mb-8">
            Sorry about that — please refresh the page and try again.
          </p>
          <Button
            size="lg"
            onClick={() => window.location.reload()}
            className="bg-primary hover:bg-primary-hover text-primary-foreground"
          >
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh page
          </Button>
        </div>
      </div>
    );
  }
}
