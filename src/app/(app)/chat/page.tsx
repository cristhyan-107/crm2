import { ChatInterface } from '@/components/chat/chat-interface';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Conversas | Leilão Ágil CRM',
};

export const dynamic = 'force-dynamic';

// Next.js 15+: searchParams is a Promise
export default async function ChatPage(props: {
  searchParams: Promise<{ jid?: string }>;
}) {
  const searchParams = await props.searchParams;
  const initialJid = searchParams?.jid;

  return (
    <div className="h-[calc(100vh-6rem)] -m-4 sm:-m-6 flex overflow-hidden bg-[#060a14]">
      <ChatInterface initialJid={initialJid} />
    </div>
  );
}
