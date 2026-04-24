// API Routes de Vercel - Proxy per a LanguageTool + Cloud Vision OCR
// Versió amb suport per a escriptura manuscrita

// ─── CONFIGURACIÓ ─────────────────────────────────────────────────────────────
const GOOGLE_VISION_API_KEY = process.env.GOOGLE_VISION_API_KEY;

// ─── ROUTER PRINCIPAL ─────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Mètode no permès' });
    return;
  }

  // Parsejar el body
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (e) {
    res.status(400).json({ error: 'Body JSON invàlid' });
    return;
  }

  // ─── RUTA OCR ───────────────────────────────────────────────────────────────
  if (body.image) {
    return handleOCR(body, res);
  }

  // ─── RUTA CORRECTOR ─────────────────────────────────────────────────────────
  if (body.text) {
    return handleCorrection(body, res);
  }

  res.status(400).json({ error: 'Falta "image" (per OCR) o "text" (per correcció)' });
}

// ─── CLOUD VISION OCR ─────────────────────────────────────────────────────────

async function handleOCR(body, res) {
  if (!GOOGLE_VISION_API_KEY) {
    res.status(500).json({ error: 'GOOGLE_VISION_API_KEY no configurada' });
    return;
  }

  const base64Image = body.image;
  console.log('→ Rebuda petició OCR, imatge base64 length:', base64Image?.length);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000); // 20 segons

    const payload = {
      requests: [{
        image: { content: base64Image },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }] // Millor per a escriptura a mà
      }]
    };

    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      }
    );

    clearTimeout(timer);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('→ Vision API error:', response.status, errorText.substring(0, 500));
      throw new Error(`Vision API HTTP ${response.status}: ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    const annotations = data?.responses?.[0]?.textAnnotations;
    const fullText = data?.responses?.[0]?.fullTextAnnotation?.text;

    // textAnnotations[0] conté tot el text, els següents són paraules individuals
    const extractedText = fullText || (annotations && annotations[0]?.description) || '';

    console.log('✅ OCR OK, text extret length:', extractedText.length);

    res.status(200).json({
      text: extractedText,
      words: annotations ? annotations.slice(1).map(a => ({
        text: a.description,
        bounds: a.boundingPoly?.vertices
      })) : [],
      source: 'google-cloud-vision'
    });

  } catch (error) {
    console.error('❌ OCR ha fallat:', error.message);
    res.status(200).json({
      text: '',
      error: 'No s\'ha pogut llegir el text: ' + error.message,
      fallback: true
    });
  }
}

// ─── LANGUAGETOOL CORRECCIÓ ───────────────────────────────────────────────────

async function handleCorrection(body, res) {
  const text = body?.text;

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    res.status(400).json({ error: 'Falta el text a corregir' });
    return;
  }

  console.log('→ Rebuda petició de correcció, longitud text:', text.length);

  try {
    const result = await tryLanguageTool(text);
    console.log('✅ Correcció obtinguda de:', result.source);

    res.status(200).json({
      matches: result.matches || [],
      source: result.source,
    });

  } catch (error) {
    console.error('❌ LanguageTool ha fallat:', error.message);

    res.status(200).json({
      matches: [],
      error: 'No s\'ha pogut connectar amb LanguageTool: ' + error.message,
      fallback: true,
    });
  }
}

async function tryLanguageTool(text) {
  console.log('→ Intentant LanguageTool...');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const body = new URLSearchParams({
      text: text,
      language: 'ca-ES'
    }).toString();

    console.log('→ Body enviat:', body);

    const response = await fetch('https://api.languagetool.org/v2/check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: body,
      signal: controller.signal,
    });

    clearTimeout(timer);

    console.log('→ Status:', response.status);
    console.log('→ StatusText:', response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('→ Error body:', errorText.substring(0, 500));
      throw new Error(`LanguageTool HTTP ${response.status}: ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    console.log('✅ LanguageTool OK, errors trobats:', data?.matches?.length ?? 0);

    return { matches: data.matches || [], source: 'languagetool' };

  } catch (e) {
    clearTimeout(timer);
    console.log('✗ LanguageTool falló:', e.message);
    throw e;
  }
}
