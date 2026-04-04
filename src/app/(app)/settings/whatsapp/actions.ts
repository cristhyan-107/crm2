'use server';

import { createServerSupabase } from '@/lib/supabase/server';
import { 
  getEvolutionInstanceStatus, 
  getEvolutionQRCode, 
  logoutEvolutionInstance
} from '@/lib/evolution';

// Function to generate deterministic instance name for the user
async function getInstanceName() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  
  // Sanitize UUID for Evolution API (no dashes if strict, but let's just prefix it)
  return `crm_${user.id.replace(/-/g, '')}`;
}

export async function checkWhatsAppStatus() {
  try {
    const instanceName = await getInstanceName();
    const status = await getEvolutionInstanceStatus(instanceName);
    
    // Status object returned by the state endpoint usually has: { instance: { state: "open" } }
    const state = status?.instance?.state || status?.state || 'UNAUTHORIZED';
    return { success: true, state, instanceName };
  } catch (error: any) {
    return { success: false, state: 'ERROR', error: error.message };
  }
}

export async function connectWhatsApp() {
  try {
    const instanceName = await getInstanceName();
    
    // getEvolutionQRCode handles: check existing → delete if stuck → create → get QR
    const qrData = await getEvolutionQRCode(instanceName);
    
    if (qrData.alreadyConnected) {
      return { success: true, alreadyConnected: true };
    }
    
    return { success: true, qr: qrData.base64 || qrData.qrcode };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function disconnectWhatsApp() {
  try {
    const instanceName = await getInstanceName();
    await logoutEvolutionInstance(instanceName);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

import { sendEvolutionMessage } from '@/lib/evolution';

export async function getInboxContacts() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Pega as últimas mensagens por número
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  // Group by contact phone
  const inboxMap = new Map();

  for (const msg of data) {
    const isOutbound = msg.direction === 'outbound';
    // If outbound, the contact phone is in 'to_number', if inbound it's in 'from_number'
    const phone = isOutbound ? msg.to_number : msg.from_number;
    
    if (!inboxMap.has(phone)) {
      inboxMap.set(phone, {
        phone,
        name: msg.contact_name || phone,
        lastMessage: msg.content,
        timestamp: msg.created_at,
        unreadCount: (!isOutbound && msg.status !== 'read') ? 1 : 0,
        isLead: !!msg.lead_id
      });
    } else {
      const existing = inboxMap.get(phone);
      if (!isOutbound && msg.status !== 'read') {
        existing.unreadCount += 1;
      }
    }
  }

  return Array.from(inboxMap.values());
}

export async function getChatHistory(contactNumber: string) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('whatsapp_messages')
    .select('*')
    .eq('user_id', user.id)
    .or(`from_number.eq.${contactNumber},to_number.eq.${contactNumber}`)
    .order('created_at', { ascending: true });

  return data;
}

export async function markChatAsRead(contactNumber: string) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from('whatsapp_messages')
    .update({ status: 'read' })
    .eq('user_id', user.id)
    .eq('from_number', contactNumber)
    .neq('status', 'read');
}

export async function sendChatMessage(contactNumber: string, content: string) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  
  const instanceName = `crm_${user.id.replace(/-/g, '')}`;

  await sendEvolutionMessage(instanceName, contactNumber, content);
  
  return { success: true };
}
