// ============================================================
// Evolution API — Camada de serviço
// Toda comunicação com a Evolution passa por aqui.
// O frontend nunca chama a Evolution diretamente.
// ============================================================

function buildUrl(path: string) {
  const BASE_URL = process.env.EVOLUTION_API_URL || '';
  const cleanBase = BASE_URL.replace(/\/+$/, '');
  const cleanPath = path.replace(/^\/+/, '');
  return `${cleanBase}/${cleanPath}`;
}

export async function evolutionFetch(endpoint: string, options?: RequestInit) {
  const API_KEY = process.env.EVOLUTION_API_KEY;

  if (!process.env.EVOLUTION_API_URL || !API_KEY) {
    throw new Error('Evolution API missing credentials in environment variables.');
  }

  const finalUrl = buildUrl(endpoint);

  const res = await fetch(finalUrl, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      apikey: API_KEY,
      ...(options?.headers || {}),
    },
  });

  const textBody = await res.text();

  if (!res.ok) {
    let errorMessage = `Evolution API error: ${res.status}`;
    try {
      if (textBody) {
        const errBody = JSON.parse(textBody);
        if (errBody?.response?.message && Array.isArray(errBody.response.message)) {
          errorMessage = errBody.response.message[0];
        } else if (errBody?.response?.message) {
          errorMessage = errBody.response.message;
        } else {
          errorMessage = errBody?.message || errBody?.error || errorMessage;
        }
      }
    } catch {
      // Ignore parse error
    }
    throw new Error(errorMessage);
  }

  return textBody ? JSON.parse(textBody) : {};
}

// ============================================================
// Instance management
// ============================================================

export async function createEvolutionInstance(instanceName: string) {
  const appUrl = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000';

  const response = await evolutionFetch('/instance/create', {
    method: 'POST',
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
      webhook: {
        url: `${appUrl}/api/webhooks/evolution`,
        byEvents: false,
        base64: false,
        events: [
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'MESSAGES_DELETE',
          'SEND_MESSAGE',
          'CHATS_UPSERT',
          'CHATS_UPDATE',
          'CONTACTS_UPSERT',
          'CONNECTION_UPDATE',
        ],
      },
    }),
  });

  return response;
}

export async function getEvolutionInstanceStatus(instanceName: string) {
  try {
    const response = await evolutionFetch(`/instance/connectionState/${instanceName}`, {
      method: 'GET',
    });
    return response;
  } catch (error: any) {
    if (error.message && (error.message.includes('404') || error.message.includes('not exist'))) {
      return { state: 'not_found', status: 'NOT_FOUND' };
    }
    return { state: 'close', status: 'DISCONNECTED', error: error.message };
  }
}

export async function fetchInstances() {
  return evolutionFetch('/instance/fetchInstances', { method: 'GET' });
}

export async function deleteEvolutionInstance(instanceName: string) {
  return evolutionFetch(`/instance/delete/${instanceName}`, { method: 'DELETE' });
}

export async function logoutEvolutionInstance(instanceName: string) {
  return evolutionFetch(`/instance/logout/${instanceName}`, { method: 'DELETE' });
}

// ============================================================
// QR Code flow (create → get QR)
// ============================================================

export async function getEvolutionQRCode(instanceName: string): Promise<any> {
  const startTime = Date.now();

  // Check if instance already exists
  const existingStatus = await getEvolutionInstanceStatus(instanceName);
  const state = existingStatus?.instance?.state || existingStatus?.state;

  if (state === 'open') {
    return { alreadyConnected: true, state: 'open' };
  }

  // If instance exists but not open, delete and recreate
  if (state && state !== 'not_found') {
    try {
      await deleteEvolutionInstance(instanceName);
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
      // ignore
    }
  }

  // Create fresh instance (v2.3.7+ returns QR in create response)
  const createRes = await createEvolutionInstance(instanceName);

  const createQR = createRes?.qrcode?.base64;
  if (createQR) {
    return { base64: createQR, ...createRes };
  }

  // Fallback: poll /connect
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const response = await evolutionFetch(`/instance/connect/${instanceName}`, { method: 'GET' });
      const qrData =
        response.base64 ||
        response.qrcode?.base64 ||
        (typeof response.qrcode === 'string' && response.qrcode.length > 50
          ? response.qrcode
          : null) ||
        response.code;

      if (qrData) return { base64: qrData, ...response };
      if (response.instance?.state === 'open' || response.state === 'open') {
        return { alreadyConnected: true, state: 'open' };
      }
    } catch (err: any) {
      // continue polling
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  throw new Error(
    `Não foi possível gerar o QR Code após ${elapsed}s. Verifique a Evolution API.`
  );
}

// ============================================================
// Webhook management
// ============================================================

export async function updateEvolutionWebhook(instanceName: string) {
  const appUrl = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000';

  return evolutionFetch(`/webhook/set/${instanceName}`, {
    method: 'POST',
    body: JSON.stringify({
      webhook: {
        url: `${appUrl}/api/webhooks/evolution`,
        enabled: true,
        webhookByEvents: false,
        webhookBase64: false,
        events: [
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'MESSAGES_DELETE',
          'SEND_MESSAGE',
          'CHATS_UPSERT',
          'CHATS_UPDATE',
          'CONTACTS_UPSERT',
          'CONNECTION_UPDATE',
        ],
      },
    }),
  });
}

// ============================================================
// Chat & Message queries (FASE 3 — Carga inicial)
// ============================================================

export interface EvolutionChat {
  remoteJid: string;
  pushName?: string;
  profilePicUrl?: string;
  unreadCount?: number;
  updatedAt?: string;
  lastMessage?: {
    message?: {
      conversation?: string;
      extendedTextMessage?: { text: string };
      imageMessage?: { caption?: string };
      audioMessage?: {};
      documentMessage?: { title?: string };
    };
    key?: { fromMe?: boolean };
    messageTimestamp?: number;
  };
}

export async function getEvolutionChats(instanceName: string): Promise<EvolutionChat[]> {
  try {
    // 55s timeout - stays within Vercel's 60s function limit
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    const res = await evolutionFetch(`/chat/findChats/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({}),
      signal: controller.signal as any,
    }).finally(() => clearTimeout(timeout));

    const chats: EvolutionChat[] = Array.isArray(res) ? res : [];

    // Filter out broadcasts and groups
    return chats.filter(
      (c) =>
        c.remoteJid &&
        !c.remoteJid.includes('@broadcast') &&
        !c.remoteJid.includes('@g.us') &&
        !c.remoteJid.includes('status@')
    );
  } catch (err: any) {
    console.error('[Evolution] getEvolutionChats error:', err.message);
    return [];
  }
}

export interface EvolutionMessage {
  key: {
    id: string;
    fromMe: boolean;
    remoteJid: string;
    participant?: string;
  };
  pushName?: string;
  messageType: string;
  message?: {
    conversation?: string;
    extendedTextMessage?: { text: string };
    imageMessage?: { caption?: string };
    audioMessage?: {};
    documentMessage?: { title?: string };
  };
  messageTimestamp: number;
  status?: string;
}

export async function getEvolutionMessages(
  instanceName: string,
  remoteJid: string,
  limit = 50
): Promise<EvolutionMessage[]> {
  try {
    const res = await evolutionFetch(`/chat/findMessages/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        where: { key: { remoteJid } },
        limit,
      }),
    });

    // Response shape: { messages: { records: [...] } } or array
    const records =
      Array.isArray(res?.messages?.records)
        ? res.messages.records
        : Array.isArray(res)
        ? res
        : [];

    return records;
  } catch (err: any) {
    console.error('[Evolution] getEvolutionMessages error:', err.message);
    return [];
  }
}

// ============================================================
// Sending messages
// ============================================================

export async function sendEvolutionMessage(
  instanceName: string,
  number: string,
  text: string
) {
  return evolutionFetch(`/message/sendText/${instanceName}`, {
    method: 'POST',
    body: JSON.stringify({
      number,
      options: {
        delay: 1200,
        presence: 'composing',
        linkPreview: false,
      },
      textMessage: { text },
    }),
  });
}

// ============================================================
// Helpers
// ============================================================

/** Extrai texto legível de qualquer tipo de mensagem */
export function extractMessageText(message?: EvolutionMessage['message']): string {
  if (!message) return '';
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  if (message.imageMessage?.caption) return `📷 ${message.imageMessage.caption}`;
  if (message.imageMessage) return '📷 Imagem';
  if (message.audioMessage) return '🎵 Áudio';
  if (message.documentMessage?.title) return `📄 ${message.documentMessage.title}`;
  if (message.documentMessage) return '📄 Documento';
  return '';
}

/** Normaliza JID → número de telefone limpo */
export function jidToPhone(jid: string): string {
  return jid.split('@')[0].split(':')[0];
}
