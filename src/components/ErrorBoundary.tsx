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
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center shrink-0">
                <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <div className="text-left">
                <h1 className="text-xl font-bold text-zinc-900 dark:text-white">
                  Application Error
                </h1>
                <p className="text-sm text-zinc-500">
                  An unexpected error occurred during execution.
                </p>
              </div>
            </div>
            
            <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-2xl p-4 mb-6 text-left">
              <p className="text-red-700 dark:text-red-400 font-medium text-sm">
                {friendlyMessage}
              </p>
            </div>

            {detailedError && (
              <div className="mb-8 text-left">
                <p className="text-xs font-mono text-zinc-400 mb-2 uppercase tracking-wider">Technical Details</p>
                <div className="bg-zinc-100 dark:bg-zinc-800 rounded-xl p-4 overflow-auto max-h-40 text-[10px] font-mono text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                  <pre className="whitespace-pre-wrap break-all">{detailedError}</pre>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={this.handleReset}
                className="flex items-center justify-center gap-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-4 py-3 rounded-2xl font-semibold hover:opacity-90 transition-opacity"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reload App</span>
              </button>
              <button
                onClick={this.handleGoHome}
                className="flex items-center justify-center gap-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white px-4 py-3 rounded-2xl font-semibold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
              >
                <Home className="w-4 h-4" />
                <span>Go Home</span>
              </button>
            </div>
          </motion.div>
        </div>
      );
    }

    return this.props.children;
  }
}
