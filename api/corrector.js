// API Route de Vercel - Proxy para Softcatalà
export default async function handler(req, res) {
  // Configurar CORS para permitir peticiones desde tu dominio
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Manejar preflight OPTIONS
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Solo aceptar POST
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Mètode no permès' });
    return;
  }

  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'Falta el text a corregir' });
      return;
    }

    // Llamar a la API de Softcatalà desde el servidor (sin CORS)
    const response = await fetch('https://api.softcatala.org/corrector/v1/check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        text: text,
        language: 'ca'
      }).toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Softcatalà error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    
    // Devolver los resultados al navegador
    res.status(200).json(data);

  } catch (error) {
    console.error('Error en corrector:', error);
    res.status(500).json({ 
      error: 'Error en el corrector',
      message: error.message 
    });
  }
}
