import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="text-center py-20 px-4">
          <p className="text-red-400 text-lg font-medium mb-2">Bir xəta baş verdi</p>
          <p className="text-text-muted text-sm mb-4">Bu hissəni yükləmək mümkün olmadı.</p>
          <button
            onClick={this.handleReset}
            className="px-4 py-2 bg-accent text-bg rounded-lg font-medium hover:bg-accent/80 transition-colors"
          >
            Yenidən cəhd et
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
