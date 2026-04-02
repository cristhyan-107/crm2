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
    // Caso de timeout ou 404/ unauthorized fallback logic
    return { state: 'unauthorized', status: 'DISCONNECTED' };
  }
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
