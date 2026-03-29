import React, { Component, ReactNode, ErrorInfo } from 'react';
import { AlertCircle, RotateCcw, Home } from 'lucide-react';
import { motion } from 'motion/react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  private handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      let friendlyMessage = "Something went wrong. Please try again later.";
      let detailedError = "";

      try {
        if (this.state.error?.message) {
          const parsedError = JSON.parse(this.state.error.message);
          if (parsedError.friendlyMessage) {
            friendlyMessage = parsedError.friendlyMessage;
          }
          detailedError = JSON.stringify(parsedError, null, 2);
        }
      } catch (e) {
        // Not a JSON error message, use default
        detailedError = this.state.error?.message || String(this.state.error);
      }

      return (
        <div className="min-h-[100dvh] flex items-center justify-center p-6 bg-zinc-50 dark:bg-zinc-950">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-8 text-center"
          >
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-3">
              Oops! Something went wrong
            </h1>
            
            <p className="text-zinc-600 dark:text-zinc-400 mb-8">
              {friendlyMessage}
            </p>

            {process.env.NODE_ENV === 'development' && detailedError && (
              <div className="mb-8 text-left">
                <p className="text-xs font-mono text-zinc-400 mb-2 uppercase tracking-wider">Error Details</p>
                <div className="bg-zinc-100 dark:bg-zinc-800 rounded-xl p-4 overflow-auto max-h-40 text-[10px] font-mono text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                  <pre>{detailedError}</pre>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={this.handleReset}
                className="flex items-center justify-center gap-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-4 py-3 rounded-2xl font-semibold hover:opacity-90 transition-opacity"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Retry</span>
              </button>
              <button
                onClick={this.handleGoHome}
                className="flex items-center justify-center gap-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white px-4 py-3 rounded-2xl font-semibold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
              >
                <Home className="w-4 h-4" />
                <span>Home</span>
              </button>
            </div>
          </motion.div>
        </div>
      );
    }

    return this.props.children;
  }
}
