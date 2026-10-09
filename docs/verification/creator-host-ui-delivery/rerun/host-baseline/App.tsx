import { useState } from 'react';
import { useAgentUILocale } from '@agent-ui/react';
import { AgentMount } from './AgentMount';
import { Button, Input, Card, ConfigProvider, theme } from 'antd';

import './design-system/system.css';
export function App() {
  const m = useAgentUILocale('accessibility');
  const [dark,setDark]=useState(false);
  return <ConfigProvider theme={{algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm, token:{borderRadius:12, colorPrimary:"#405bce", fontFamily:"Inter,system-ui,sans-serif"}}}><div className="acme-host" data-theme={dark ? "dark" : "light"}><Card><Button aria-label={m.language} onClick={()=>setDark(!dark)}>{m.language}</Button><Input aria-label={m.language} placeholder={m.language} /></Card><AgentMount /></div></ConfigProvider>;
}
