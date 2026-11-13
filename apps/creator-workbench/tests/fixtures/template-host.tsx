// Copied into a generated project's src/main.tsx by the production fixture.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Agent } from './agent-ui';
import { agentUIProject } from './agent-ui/application/project-config';
import { createHttpConversationDataSource } from './agent-ui/services/conversations';
import { createConversationTransientMessageService } from '@za38.03/agent-ui-runtime/plugin-api';
import './host.css';

const query = new URLSearchParams(location.search);
const history = query.has('history')
  ? createHttpConversationDataSource({ endpoint: new URL('/history', location.href).href })
  : undefined;
const notices = createConversationTransientMessageService();
if (query.has('suggestions')) {
  agentUIProject.getConversationStarterSuggestions = () => [
    { title: '起步问题', label: '测试建议', prompt: 'Suggested prompt' },
  ];
}

function Host() {
  const [locale, setLocale] = useState<'zh-CN' | 'en-US'>(query.get('locale') === 'en-US' ? 'en-US' : 'zh-CN');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const presentation = query.has('suggestions');
  return <>
    <header className='fixture-business'>
      <input aria-label='Host business input' defaultValue='Host content' />
      {presentation && <>
        <button onClick={() => notices.addMessage({ role: 'assistant', text: 'Local page notice' })}>Host notice</button>
        <button onClick={() => setLocale(value => value === 'zh-CN' ? 'en-US' : 'zh-CN')}>Host language</button>
        <button onClick={() => setTheme(value => value === 'light' ? 'dark' : 'light')}>Host theme</button>
      </>}
    </header>
    <section className='fixture-agent'>
      <Agent endpoint='/agent' locale={locale} conversationDataSource={history}
        {...(presentation ? { theme, transientMessages: notices } : {})} />
    </section>
  </>;
}
createRoot(document.getElementById('root')!).render(<Host />);
