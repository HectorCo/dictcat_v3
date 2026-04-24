// API Route de Vercel - OCR amb Google Cloud Vision
// Fitxer independent, no modifica corrector.js

const GOOGLE_VISION_API_KEY = process.env.GOOGLE_VISION_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Mètode no permès. Usa POST.' });
    return;
  }

  // Parsejar body
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (e) {
    res.status(400).json({ error: 'Body JSON invàlid' });
    return;
  }

  const base64Image = body?.image;

  if (!base64Image || typeof base64Image !== 'string') {
    res.status(400).json({ error: 'Falta el camp "image" amb la imatge en base64' });
    return;
  }

  if (!GOOGLE_VISION_API_KEY) {
    res.status(500).json({ error: 'GOOGLE_VISION_API_KEY no configurada' });
    return;
  }

  console.log('→ Petició OCR rebuda, imatge base64 length:', base64Image.length);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);

    const payload = {
      requests: [{
        image: { content: base64Image },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }]
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
