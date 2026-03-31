// Types for Evolution API Events and Messages

export type EvolutionEventType = 
  | 'MESSAGES_UPSERT'
  | 'MESSAGES_UPDATE'
  | 'SEND_MESSAGE'
  | 'CONTACTS_UPDATE'
  | 'CHATS_UPSERT'
  | 'CONNECTION_UPDATE';

export type EvolutionMessageDirection = 'inbound' | 'outbound';

export type EvolutionMessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface WebhookPayload {
  event: EvolutionEventType;
  instance: string;
  data: any;
  destination?: string;
  date_time?: string;
  sender?: string;
  apikey?: string;
}

// Service parameters
export type SendWhatsAppMessageParams = {
  leadId?: string; // Optional if sending to unknown lead yet
  userId: string;  // Authorized user triggering the send
  phone: string;
  message: string;
};

// Required return shape
export type SendWhatsAppMessageResponse = {
  success: boolean;
  messageId?: string;
  status: EvolutionMessageStatus;
  error?: string;
};
