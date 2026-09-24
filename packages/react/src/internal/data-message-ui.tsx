import { useAssistantDataUI } from "@assistant-ui/react";
import type { ComponentType } from "react";

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
): DataMessageUIDefinition<TData> {
  return definition;
}

/** Internal host bridge. Plugin authors never register with assistant-ui directly. */
export function DataMessageUIRegistration({
  definition,
}: {
  definition: DataMessageUIDefinition<never>;
}) {
  useAssistantDataUI({
    name: definition.name,
    render: ({ data }) => {
      const Renderer = definition.render;
      return <Renderer data={data as never} />;
    },
  });
  return null;
}
