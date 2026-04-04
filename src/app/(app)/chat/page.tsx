import { getInboxContacts } from './actions';
import { ChatInterface } from '@/components/chat/chat-interface';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Conversas | Leilão Ágil CRM',
};

// Opt out of caching so we get fresh inbox on SSR
export const dynamic = 'force-dynamic';

export default async function ChatPage() {
  const inbox = await getInboxContacts();

  return (
    <div className="h-[calc(100vh-6rem)] -m-4 sm:-m-6 flex overflow-hidden bg-[#060a14]">
      <ChatInterface initialInbox={inbox} />
    </div>
  );
}
