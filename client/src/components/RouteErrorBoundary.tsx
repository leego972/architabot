import { cn } from "@/lib/utils";
import { AlertTriangle, ArrowLeft, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Optional label shown in the error UI, e.g. "Builder Chat" */
  pageName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Per-route error boundary. Unlike the global ErrorBoundary, this one:
 * - Only crashes the current page, not the entire app
 * - Offers "Go Back" in addition to "Reload"
 * - Shows a friendlier message with the page name
 * - Resets when the user navigates away and back
 */
class RouteErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log to structured logger in production
    console.error(`[RouteError] ${error.message}`, {
      component: info.componentStack?.substring(0, 500),
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleGoBack = () => {
    this.setState({ hasError: false, error: null });
    window.history.back();
  };

  render() {
    if (this.state.hasError) {
      const pageName = this.props.pageName || "This page";
      return (
        <div className="flex items-center justify-center min-h-[60vh] p-8">
          <div className="flex flex-col items-center w-full max-w-lg text-center">
            <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <AlertTriangle size={28} className="text-destructive" />
            </div>

            <h2 className="text-lg font-semibold mb-2">
              {pageName} hit a snag
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Something went wrong loading this section. The rest of the app is
              still working fine.
            </p>

            {this.state.error && (
              <div className="p-3 w-full rounded-lg bg-muted overflow-auto mb-5 text-left">
                <pre className="text-xs text-muted-foreground whitespace-break-spaces">
                  {this.state.error.message}
                </pre>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={this.handleGoBack}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm",
                  "bg-muted text-foreground",
                  "hover:bg-muted/80 cursor-pointer transition-colors"
                )}
              >
                <ArrowLeft size={14} />
                Go Back
              </button>
              <button
                onClick={this.handleRetry}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm",
                  "bg-primary text-primary-foreground",
                  "hover:opacity-90 cursor-pointer transition-colors"
                )}
              >
                <RotateCcw size={14} />
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default RouteErrorBoundary;
