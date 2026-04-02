const getEvoConfig = () => {
  const baseUrl = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
  const apiKey = process.env.EVOLUTION_API_KEY || 'SUA_API_KEY_AQUI';
  return { baseUrl, apiKey };
};

export async function createEvolutionInstance(instanceName: string) {
  const { baseUrl, apiKey } = getEvoConfig();

  const response = await fetch(`${baseUrl}/instance/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': apiKey,
    },
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS'
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || 'Erro ao criar instância na Evolution API');
  }

  // Set webhook right after creation
  await setEvolutionWebhook(instanceName);

  return response.json();
}

export async function setEvolutionWebhook(instanceName: string) {
    const { baseUrl, apiKey } = getEvoConfig();
    const appUrl = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000';
    
    // Set Webhook to receive messages
    const response = await fetch(`${baseUrl}/webhook/set/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
      },
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
  
    if (!response.ok) {
        console.warn(`Falha ao definir webhook para ${instanceName}`);
    }
}

export async function getEvolutionInstanceStatus(instanceName: string) {
  const { baseUrl, apiKey } = getEvoConfig();

  const response = await fetch(`${baseUrl}/instance/connectionState/${instanceName}`, {
    method: 'GET',
    headers: {
      'apikey': apiKey,
    }
  });

  if (!response.ok) {
    return { state: 'unauthorized', status: 'DISCONNECTED' };
  }

  return response.json(); // { instance: { state: "open" } }
}

export async function getEvolutionQRCode(instanceName: string) {
  const { baseUrl, apiKey } = getEvoConfig();

  const response = await fetch(`${baseUrl}/instance/connect/${instanceName}`, {
    method: 'GET',
    headers: {
      'apikey': apiKey,
    }
  });

  if (!response.ok) {
    throw new Error('Falha ao obter QR Code');
  }

  return response.json(); // { base64: "..." }
}

export async function logoutEvolutionInstance(instanceName: string) {
  const { baseUrl, apiKey } = getEvoConfig();

  const response = await fetch(`${baseUrl}/instance/logout/${instanceName}`, {
    method: 'DELETE',
    headers: {
      'apikey': apiKey,
    }
  });

  if (!response.ok) {
    throw new Error('Falha ao desconectar instância');
  }

  return response.json();
}
