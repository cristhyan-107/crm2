'use server';

// Este arquivo re-exporta tudo da camada centralizada de WhatsApp actions.
// Mantido por compatibilidade com a rota /chat.

export {
  getInboxContacts,
  getChatHistory,
  markChatAsRead,
  sendChatMessage,
} from '@/app/(app)/settings/whatsapp/actions';
