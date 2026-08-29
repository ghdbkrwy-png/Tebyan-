const { MODEL_TEXT, MODEL_TEXT_FALLBACK, CORS, json, callGemini, extractText, tryParseJson } = require('./_lib');

const RATIO_LABEL = {
  short: 'من 4 إلى 6 نقاط، مختصرة جدًا وتغطي الجوهر فقط',
  balanced: 'من 7 إلى 10 نقاط متوازنة التفصيل',
  detailed: 'من 10 إلى 16 نقطة تفصيلية تغطي أغلب أفكار المستند'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'الطريقة غير مسموحة' });

  try {
    const { fileBase64, mimeType, level } = JSON.parse(event.body || '{}');
    if (!fileBase64) return json(400, { error: 'لم يتم إرفاق ملف.' });

    const detail = RATIO_LABEL[level] || RATIO_LABEL.balanced;
    const prompt = `لخّص المستند المرفق بالعربية الفصحى الواضحة. أعد النتيجة بصيغة JSON فقط بهذا الشكل:
{"summary": ["نقطة 1", "نقطة 2"]}
اجعل عدد النقاط: ${detail}. كل نقطة جملة مستقلة كاملة المعنى، بدون ترقيم داخل النص، وبدون تكرار.`;

    const payload = {
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType || 'application/pdf', data: fileBase64 } },
          { text: prompt }
        ]
      }],
      generationConfig: { responseMimeType: 'application/json' }
    };

    const data = await callGemini(MODEL_TEXT, MODEL_TEXT_FALLBACK, payload);
    const result = tryParseJson(extractText(data));
    return json(200, result);
  } catch (err) {
    return json(500, { error: err.message });
  }
};
