import { ContextRetrievalMessagePlugin as Implementation } from '@za38.03/agent-ui-plugins/context-retrieval-message';
import type { ComponentProps } from 'react';

export const ContextRetrievalMessagePlugin = (props: ComponentProps<typeof Implementation>) => {
  return <Implementation {...props} />;
};
