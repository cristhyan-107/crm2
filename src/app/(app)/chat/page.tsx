import { ChatInterface } from '@/components/chat/chat-interface';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Conversas | Leilão Ágil CRM',
};

export const dynamic = 'force-dynamic';

export default function ChatPage() {
  return (
    <div className="h-[calc(100vh-6rem)] -m-4 sm:-m-6 flex overflow-hidden bg-[#060a14]">
      <ChatInterface />
    </div>
  );
}
