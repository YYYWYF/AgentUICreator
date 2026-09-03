import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from "react";

interface PluginErrorBoundaryProps {
  children: ReactNode;
  pluginId: string;
  pluginName: string;
  instanceId: string;
  onError(failure: PluginRenderFailure): void;
  onReset(instanceId: string): void;
  resetKeys: readonly unknown[];
}

export interface PluginRenderFailure {
  componentStack?: string | undefined;
  errorMessage: string;
  instanceId: string;
  pluginId: string;
  pluginName: string;
}

interface PluginErrorBoundaryState {
  errorMessage: string | undefined;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resetKeysChanged(
  previous: readonly unknown[],
  current: readonly unknown[],
): boolean {
  return (
    previous.length !== current.length ||
    previous.some((value, index) => !Object.is(value, current[index]))
  );
}

/** Isolates React render and lifecycle failures to one PluginInstance. */
export class PluginErrorBoundary extends Component<
  PluginErrorBoundaryProps,
  PluginErrorBoundaryState
> {
  state: PluginErrorBoundaryState = { errorMessage: undefined };

  static getDerivedStateFromError(error: unknown): PluginErrorBoundaryState {
    return { errorMessage: toErrorMessage(error) };
  }

  componentDidMount(): void {
    if (this.state.errorMessage === undefined) {
      this.props.onReset(this.props.instanceId);
    }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    this.props.onError({
      ...(info.componentStack === null
        ? {}
        : { componentStack: info.componentStack }),
      errorMessage: toErrorMessage(error),
      instanceId: this.props.instanceId,
      pluginId: this.props.pluginId,
      pluginName: this.props.pluginName,
    });
  }

  componentDidUpdate(previousProps: PluginErrorBoundaryProps): void {
    if (
      this.state.errorMessage !== undefined &&
      resetKeysChanged(previousProps.resetKeys, this.props.resetKeys)
    ) {
      this.props.onReset(this.props.instanceId);
      this.setState({ errorMessage: undefined });
    }
  }

  render(): ReactNode {
    const { errorMessage } = this.state;

    if (errorMessage === undefined) {
      return this.props.children;
    }

    return null;
  }
}
