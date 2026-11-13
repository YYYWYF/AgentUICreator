import { SkillsPlugin as Implementation } from '@za38.03/agent-ui-plugins/skills';
import type { ComponentProps } from 'react';
export function SkillsPlugin(props: ComponentProps<typeof Implementation>) { return <Implementation {...props} />; }
