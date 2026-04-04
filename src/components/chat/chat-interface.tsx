'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  Send, Search, User as UserIcon, Check, CheckCheck, 
  Clock, RefreshCw, MessageSquareDashed, ArrowLeft,
  Smartphone
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getInboxContacts, getChatHistory, markChatAsRead, sendChatMessage } from '@/app/(app)/settings/whatsapp/actions';

// Helpers
function formatTime(isoString: string) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(isoString: string) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (date.toDateString() === new Date().toDateString()) return formatTime(isoString);
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function ChatInterface({ initialInbox = [] }: { initialInbox?: any[] }) {
  const [inbox, setInbox] = useState<any[]>(initialInbox);
  
  useEffect(() => {
    if (initialInbox.length === 0) {
       getInboxContacts().then(setInbox);
    }
  }, [initialInbox.length]);
  const [selectedContact, setSelectedContact] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Pollings / Sync stuff could be implemented via Supabase Realtime later
  // For now we'll do an aggressive manual scroll
  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load chat history when contact selected
  useEffect(() => {
    if (!selectedContact) return;

    let isMounted = true;
    setIsLoadingHistory(true);

    getChatHistory(selectedContact.phone).then((history) => {
      if (isMounted) {
        setMessages(history || []);
        setIsLoadingHistory(false);
      }
    });

    // Mark as read
    if (selectedContact.unreadCount > 0) {
      markChatAsRead(selectedContact.phone).then(() => {
        // Update local inbox unread state
        setInbox(prev => prev.map(c => 
          c.phone === selectedContact.phone ? { ...c, unreadCount: 0 } : c
        ));
      });
    }

    return () => { isMounted = false; };
  }, [selectedContact]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newMessage.trim() || !selectedContact || isSending) return;

    const contentToSend = newMessage.trim();
    setNewMessage('');
    setIsSending(true);

    // Add optimistic message
    const tempId = Date.now().toString();
    const optimisticMsg = {
      id: tempId,
      message_id: tempId,
      content: contentToSend,
      direction: 'outbound',
      status: 'sending',
      created_at: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, optimisticMsg]);
    
    // Update inbox optimistic
    setInbox(prev => {
      const existing = prev.find(c => c.phone === selectedContact.phone);
      if (existing) {
        existing.lastMessage = contentToSend;
        existing.timestamp = optimisticMsg.created_at;
      }
      return [...prev].sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    });

    try {
      await sendChatMessage(selectedContact.phone, contentToSend);
      // Update local optimistic msg
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'sent' } : m));
    } catch (err: any) {
      console.error(err);
      // Revert optimistic or mark as failed
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
    } finally {
      setIsSending(false);
    }
  };

  const filteredInbox = inbox.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.phone.includes(searchQuery)
  );

  return (
    <div className="flex w-full h-full bg-[#060a14] overflow-hidden text-white">
      
      {/* Left Sidebar - Contact List */}
      <div className={cn(
        "w-full lg:w-[380px] flex-shrink-0 flex flex-col border-r border-white/[0.06] bg-[#080d18]/50 transition-all duration-300",
        selectedContact ? "hidden lg:flex" : "flex"
      )}>
        {/* Header */}
        <div className="h-16 flex-shrink-0 flex items-center px-4 border-b border-white/[0.06]">
          <h2 className="text-lg font-semibold tracking-tight truncate flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-blue-500" />
            Caixa de Entrada
          </h2>
        </div>

        {/* Search */}
        <div className="p-4 flex-shrink-0 border-b border-white/[0.06]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input 
              type="text" 
              placeholder="Buscar contatos ou números..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-9 pr-4 bg-white/[0.03] border border-white/[0.06] rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>
        </div>

        {/* Contacts */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
          {filteredInbox.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <MessageSquareDashed className="w-10 h-10 text-gray-600 mb-3" />
              <p className="text-gray-400 font-medium text-sm">Nenhuma conversa encontrada</p>
            </div>
          ) : (
            <div className="p-3 flex flex-col gap-1">
              {filteredInbox.map(contact => {
                const isActive = selectedContact?.phone === contact.phone;
                const dateDesc = formatDate(contact.timestamp);
                
                return (
                  <button
                    key={contact.phone}
                    onClick={() => setSelectedContact(contact)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left",
                      isActive 
                        ? "bg-blue-500/10 border-blue-500/20" 
                        : "hover:bg-white/[0.04] border-transparent"
                    )}
                    style={{ borderWidth: '1px' }}
                  >
                    <div className="relative">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center flex-shrink-0 border border-white/[0.08]">
                        <UserIcon className={cn("w-5 h-5", contact.isLead ? "text-blue-400" : "text-gray-400")} />
                      </div>
                      {contact.unreadCount > 0 && (
                        <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-[10px] font-bold text-white shadow-lg shadow-blue-500/20">
                          {contact.unreadCount}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-1">
                        <span className={cn("font-medium text-sm truncate", isActive ? "text-white" : "text-gray-200")}>
                          {contact.name || contact.phone}
                        </span>
                        <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                          {dateDesc}
                        </span>
                      </div>
                      <p className={cn(
                        "text-xs truncate",
                        contact.unreadCount > 0 ? "text-blue-400 font-medium" : "text-gray-500"
                      )}>
                        {contact.lastMessage || 'Envio de anexo'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right Pane - Chat Window */}
      <div className={cn(
        "flex-1 flex flex-col h-full bg-[#060a14] relative",
        !selectedContact ? "hidden lg:flex" : "flex"
      )}>
        {!selectedContact ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 text-gray-500">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-center mb-4">
              <MessageSquareDashed className="w-8 h-8 text-gray-600" />
            </div>
            <h3 className="text-lg font-medium text-gray-300 mb-1">Canais de Mensagens</h3>
            <p className="max-w-xs mx-auto text-sm">
              Selecione uma conversa na lateral para começar a enviar mensagens via WhatsApp.
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="h-16 flex-shrink-0 flex items-center justify-between px-4 lg:px-6 border-b border-white/[0.06] bg-[#060a14]/80 backdrop-blur-md z-10">
              <div className="flex items-center gap-3">
                <button 
                  className="lg:hidden p-2 -ml-2 text-gray-400 hover:text-white transition-colors"
                  onClick={() => setSelectedContact(null)}
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center border border-white/[0.08]">
                  <UserIcon className={cn("w-5 h-5", selectedContact.isLead ? "text-blue-400" : "text-gray-400")} />
                </div>
                <div>
                  <h3 className="font-semibold text-white tracking-tight">
                    {selectedContact.name || selectedContact.phone}
                  </h3>
                  <p className="text-xs text-gray-400 font-medium">
                    {selectedContact.phone}
                    {!selectedContact.isLead && (
                       <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500/80 text-[10px] uppercase font-bold tracking-wider">Desconhecido</span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Chat Area */}
            <div 
              ref={scrollContainerRef}
              className="flex-1 overflow-y-auto p-4 lg:p-6 custom-scrollbar bg-[url('/bg-chat.png')] bg-repeat bg-center"
              style={{
                // Optional faint chat background texture
                backgroundImage: 'radial-gradient(circle at center, rgba(255,255,255,0.01) 0%, transparent 100%)'
              }}
            >
              {isLoadingHistory ? (
                <div className="flex items-center justify-center h-full">
                  <RefreshCw className="w-6 h-6 text-blue-500 animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-gray-500 font-medium">
                  Nenhuma mensagem encontrada neste histórico.
                </div>
              ) : (
                <div className="flex flex-col gap-4 pb-4">
                  {messages.map((msg, idx) => {
                    const isMe = msg.direction === 'outbound';
                    const showTail = idx === messages.length - 1 || messages[idx + 1].direction !== msg.direction;

                    return (
                      <div 
                        key={msg.id || idx} 
                        className={cn(
                          "flex w-full",
                          isMe ? "justify-end" : "justify-start"
                        )}
                      >
                        <div 
                          className={cn(
                            "relative max-w-[85%] sm:max-w-[70%] px-4 py-2.5 shadow-sm text-[15px] leading-relaxed",
                            isMe 
                              ? "bg-blue-600 text-white rounded-2xl rounded-br-sm" 
                              : "bg-[#161c28] border border-white/[0.04] text-gray-100 rounded-2xl rounded-bl-sm"
                          )}
                        >
                          <p className="whitespace-pre-wrap word-break min-w-[20px]">{msg.content}</p>
                          
                          <div className={cn(
                            "flex items-center justify-end gap-1.5 mt-1 -mb-1",
                            isMe ? "text-blue-200" : "text-gray-500"
                          )}>
                            <span className="text-[10px] tracking-wider font-semibold">
                              {formatTime(msg.created_at)}
                            </span>
                            {isMe && (
                              <span className="flex-shrink-0">
                                {msg.status === 'read' ? (
                                  <CheckCheck className="w-3.5 h-3.5 text-blue-300" />
                                ) : msg.status === 'delivered' ? (
                                  <CheckCheck className="w-3.5 h-3.5" />
                                ) : msg.status === 'sent' ? (
                                  <Check className="w-3.5 h-3.5" />
                                ) : msg.status === 'sending' ? (
                                  <Clock className="w-3 h-3 opacity-70" />
                                ) : msg.status === 'failed' ? (
                                  <span className="text-red-400 text-xs font-bold">!</span>
                                ) : (
                                  <Check className="w-3.5 h-3.5 opacity-50" />
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input Area */}
            <div className="mt-auto bg-[#080d18] flex-shrink-0 p-4 border-t border-white/[0.06]">
              <form 
                onSubmit={handleSendMessage}
                className="max-w-4xl mx-auto flex items-end gap-3"
              >
                <div className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-2xl overflow-hidden focus-within:border-blue-500/50 transition-colors">
                  <textarea 
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder="Digite uma mensagem..."
                    className="w-full max-h-32 min-h-[44px] p-3 pl-4 bg-transparent text-white text-sm focus:outline-none resize-none custom-scrollbar"
                    rows={1}
                    style={{
                      height: 'auto',
                    }}
                  />
                </div>
                <button 
                  type="submit"
                  disabled={!newMessage.trim() || isSending}
                  className="h-11 w-11 flex-shrink-0 rounded-full bg-blue-600 hover:bg-blue-500 flex items-center justify-center text-white disabled:opacity-50 disabled:hover:bg-blue-600 transition-all shadow-lg shadow-blue-500/20 active:scale-95"
                >
                  <Send className="w-5 h-5 ml-1" />
                </button>
              </form>
              <div className="max-w-4xl mx-auto text-center mt-2">
                <span className="text-[10px] text-gray-500 font-medium">Use Enter para enviar e Shift+Enter para quebrar a linha</span>
              </div>
            </div>
          </>
        )}
      </div>

    </div>
  );
}
