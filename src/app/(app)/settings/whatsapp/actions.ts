'use server';

import { createServerSupabase } from '@/lib/supabase/server';
import { 
  createEvolutionInstance, 
  getEvolutionInstanceStatus, 
  getEvolutionQRCode, 
  logoutEvolutionInstance,
  ensureInstanceExists
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
    
    // Ensure instance exists. If not, it will be automatically created.
    await ensureInstanceExists(instanceName);
    
    // Fetch QR Code
    const qrData = await getEvolutionQRCode(instanceName);
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
