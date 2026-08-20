import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Render the fallback centered on a blank page (top-level boundary). When
   * false, it renders inline so a surrounding shell (sidebar/header) stays
   * mounted and usable. */
  fullPage?: boolean;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render-time errors anywhere below it in the tree (e.g. a field the
 * backend renamed or omitted, such as `payment_status` vs `status`) and shows
 * a recoverable panel instead of unmounting the whole app / sidebar.
 *
 * React error boundaries only catch errors thrown during rendering, in
 * lifecycle methods, and in constructors of the tree below them — not inside
 * event handlers or async code (those are handled by try/catch + flash
 * messages elsewhere in the app).
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Unhandled render error caught by ErrorBoundary:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  handleReload = () => {
    window.location.assign('/');
  };

  render() {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    const panel = (
      <div className="glass-card" style={{ maxWidth: '520px', width: '100%', padding: '36px', textAlign: 'center' }}>
        <div style={{ fontSize: '40px', marginBottom: '12px' }} aria-hidden="true">&#9888;&#65039;</div>
        <h1 className="page-title" style={{ marginBottom: '8px' }}>Something went wrong</h1>
        <p className="page-sub" style={{ marginBottom: '20px' }}>
          This screen hit an unexpected error and could not be displayed. This is usually caused by a
          backend response that didn't match what the app expected. Your session is still active.
        </p>

        <div className="alert alert-danger" role="alert" style={{ textAlign: 'left', marginBottom: '24px' }}>
          <span>{error.message || 'Unknown error'}</span>
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button type="button" className="btn btn-primary" onClick={this.handleReset}>
            Try Again
          </button>
          <button type="button" className="btn btn-ghost" onClick={this.handleReload}>
            Go to Home
          </button>
        </div>
      </div>
    );

    if (this.props.fullPage === false) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 16px' }}>
          {panel}
        </div>
      );
    }

    return <div className="auth-shell">{panel}</div>;
  }
}
