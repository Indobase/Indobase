import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class BuilderErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Indobase Builder error boundary:', error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-8 text-center">
          <h1 className="text-xl font-semibold text-bolt-elements-textPrimary">Something went wrong</h1>
          <p className="max-w-lg text-sm text-bolt-elements-textSecondary">
            Indobase Builder hit an unexpected error. Hard-refresh the page or start a new chat. If this keeps
            happening, open the terminal reset control and try again.
          </p>
          <pre className="max-h-40 max-w-2xl overflow-auto rounded-lg bg-bolt-elements-background-depth-2 p-4 text-left text-xs text-bolt-elements-textSecondary">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            className="rounded-lg bg-bolt-elements-button-primary-background px-4 py-2 text-sm text-bolt-elements-button-primary-text"
            onClick={() => window.location.reload()}
          >
            Reload Indobase Builder
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
