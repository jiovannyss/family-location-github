import { Component, ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[ErrorBoundary] caught', error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="max-w-md w-full text-center space-y-4">
            <h1 className="text-xl font-semibold text-foreground">Възникна грешка</h1>
            <p className="text-sm text-muted-foreground break-words">
              {this.state.error.message || 'Неочаквана грешка в приложението.'}
            </p>
            <button
              onClick={() => { this.reset(); window.location.href = '/'; }}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm"
            >
              Презареди
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
