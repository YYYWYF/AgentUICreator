import { Component, type ErrorInfo, type ReactNode } from "react";

export interface PreviewRuntimeFailure {
  componentStack?: string | undefined;
  errorMessage: string;
  revision: string;
}

interface PreviewCompositionBoundaryProps {
  children: ReactNode;
  revision: string;
  onError?(failure: PreviewRuntimeFailure): void;
}

interface PreviewCompositionBoundaryState {
  errorMessage?: string | undefined;
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Keeps Preview failures inside the published composition lifecycle. */
export class PreviewCompositionBoundary extends Component<
  PreviewCompositionBoundaryProps,
  PreviewCompositionBoundaryState
> {
  state: PreviewCompositionBoundaryState = {};

  static getDerivedStateFromError(
    error: unknown,
  ): PreviewCompositionBoundaryState {
    return { errorMessage: messageFor(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    this.props.onError?.({
      ...(info.componentStack === null
        ? {}
        : { componentStack: info.componentStack }),
      errorMessage: messageFor(error),
      revision: this.props.revision,
    });
  }

  componentDidUpdate(
    previousProps: PreviewCompositionBoundaryProps,
  ): void {
    if (
      this.state.errorMessage !== undefined &&
      previousProps.revision !== this.props.revision
    ) {
      this.setState({ errorMessage: undefined });
    }
  }

  render(): ReactNode {
    if (this.state.errorMessage === undefined) {
      return this.props.children;
    }
    return (
      <main className="development-preview preview-runtime-error" role="alert">
        <h1>Preview unavailable</h1>
        <p>The last published composition is still isolated from Creator controls.</p>
        {import.meta.env.DEV ? <pre>{this.state.errorMessage}</pre> : null}
      </main>
    );
  }
}
