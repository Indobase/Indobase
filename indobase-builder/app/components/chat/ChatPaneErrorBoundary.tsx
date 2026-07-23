import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Isolates chat transcript / recommendation card crashes so a single bad
 * Markdown or progress render cannot blank the whole Builder shell.
 */
export class ChatPaneErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Indobase Builder chat pane error:', error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          className="mx-auto flex w-full max-w-chat flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-5 text-left"
          role="alert"
        >
          <div className="text-sm font-semibold text-red-900">Chat view hit a display error</div>
          <p className="text-sm text-red-800">
            Your project files are still in the workbench. Reload the chat pane to keep building.
          </p>
          <pre className="max-h-28 overflow-auto rounded-lg bg-white/70 p-3 text-xs text-red-900/80">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            className="self-start rounded-lg bg-red-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
