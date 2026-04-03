export async function evolutionFetch(endpoint: string, options?: RequestInit) {
  const BASE_URL = process.env.EVOLUTION_API_URL;
  const API_KEY = process.env.EVOLUTION_API_KEY;

  if (!BASE_URL || !API_KEY) {
    throw new Error('Evolution API missing credentials in environment variables.');
  }

  // Ensure endpoint starts with a slash
  const urlPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  const res = await fetch(`${BASE_URL}${urlPath}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      apikey: API_KEY,
      ...(options?.headers || {}),
    },
  });

  if (!res.ok) {
    // Tenta ler o erro do json, fallback para o status na exceção
    let errorMessage = `Evolution API error: ${res.status}`;
    try {
      const errBody = await res.json();
      errorMessage = errBody?.message || errBody?.error || errorMessage;
    } catch {
      // Body não era json, ignora e lança o base errorMessage
    }
    throw new Error(errorMessage);
  }

  return res.json();
}

export async function createEvolutionInstance(instanceName: string) {
  const response = await evolutionFetch('/instance/create', {
    method: 'POST',
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS'
    })
  });

  // Set webhook right after creation
  await setEvolutionWebhook(instanceName);

  return response;
}

export async function setEvolutionWebhook(instanceName: string) {
  const appUrl = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000';
  
  try {
    await evolutionFetch(`/webhook/set/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        url: `${appUrl}/api/webhooks/evolution`,
        webhook_by_events: false,
        webhook_base64: false,
        events: [
            "MESSAGES_UPSERT",
            "MESSAGES_UPDATE"
        ]
      })
    });
  } catch (err: any) {
    console.warn(`Falha ao definir webhook para ${instanceName}:`, err.message);
  }
}

export async function getEvolutionInstanceStatus(instanceName: string) {
  try {
    const response = await evolutionFetch(`/instance/connectionState/${instanceName}`, {
      method: 'GET'
    });
    return response; // { instance: { state: "open" } }
  } catch (error: any) {
    if (error.message && (error.message.includes('404') || error.message.includes('not exist'))) {
      return { state: 'not_found', status: 'NOT_FOUND' };
    }
    // Caso de timeout ou unauthorized fallback logic
    return { state: 'unauthorized', status: 'DISCONNECTED', error: error.message };
  }
}

export async function fetchInstances() {
  return evolutionFetch('/instance/fetchInstances', {
    method: 'GET'
  });
}

export async function connectInstance(instanceName: string) {
  return getEvolutionQRCode(instanceName);
}

export async function ensureInstanceExists(instanceName: string) {
  const status = await getEvolutionInstanceStatus(instanceName);
  
  if (status?.status === 'NOT_FOUND' || status?.state === 'not_found' || (status?.error && status.error.includes('not exist'))) {
    // A instância não existe, tentar criar automaticamente
    try {
      await createEvolutionInstance(instanceName);
    } catch (error: any) {
      throw new Error(`A instância do WhatsApp ainda não existe. Tentando criar automaticamente, mas falhou: ${error.message}`);
    }
  }
  
  return instanceName;
}

export async function getEvolutionQRCode(instanceName: string) {
  const response = await evolutionFetch(`/instance/connect/${instanceName}`, {
    method: 'GET'
  });
  return response; // { base64: "..." }
}

export async function logoutEvolutionInstance(instanceName: string) {
  const response = await evolutionFetch(`/instance/logout/${instanceName}`, {
    method: 'DELETE'
  });
  return response;
}
