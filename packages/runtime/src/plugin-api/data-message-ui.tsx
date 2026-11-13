import { useAssistantDataUI } from "@assistant-ui/react";
import { useCallback, type ComponentType } from "react";

export interface DataMessageUIRenderProps<TData = unknown> {
  data: TData;
}

export interface DataMessageUIDefinition<TData = unknown> {
  name: string;
  render: ComponentType<DataMessageUIRenderProps<TData>>;
}

/** The payload type helps authors at compile time; the AG-UI payload is not validated here. */
export function defineDataMessageUI<TData>(
  definition: DataMessageUIDefinition<TData>,
): DataMessageUIDefinition<never> {
  // Keep authoring props typed above, then erase the payload at the host
  // registration boundary, which supports heterogeneous named renderers.
  return definition as unknown as DataMessageUIDefinition<never>;
}

/** Internal host bridge. Plugin authors never register with assistant-ui directly. */
export function DataMessageUIRegistration({
  definition,
}: {
  definition: DataMessageUIDefinition<never>;
}) {
  const Renderer = definition.render;
  // assistant-ui treats the registered render function as a component type.
  // Keep it stable across Host updates so mounted message state survives.
  const render = useCallback(
    ({ data }: DataMessageUIRenderProps) => <Renderer data={data as never} />,
    [Renderer],
  );
  useAssistantDataUI({
    name: definition.name,
    render,
  });
  return null;
}
