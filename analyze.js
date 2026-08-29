const { MODEL_TEXT, MODEL_TEXT_FALLBACK, CORS, json, callGemini, extractText, tryParseJson } = require('./_lib');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'الطريقة غير مسموحة' });

  try {
    const { fileBase64, mimeType } = JSON.parse(event.body || '{}');
    if (!fileBase64) return json(400, { error: 'لم يتم إرفاق ملف.' });

    const prompt = `أنت مساعد يحلل المستندات بدقة. اقرأ المستند المرفق كاملًا، ثم أعد النتيجة بصيغة JSON فقط، بدون أي نص أو شرح خارج الكائن، وبهذا الشكل بالضبط:
{"title": "عنوان مختصر ودقيق للمستند بالعربية", "language": "اللغة الأصلية للمستند", "docType": "نوع المستند (بحث، تقرير، عقد، كتاب...)", "outline": ["محور رئيسي 1", "محور رئيسي 2"]}
اجعل outline يحتوي 5 إلى 8 عناصر، كل عنصر جملة قصيرة بالعربية تلخص محورًا رئيسيًا فعليًا ورد في المستند، بترتيب ظهوره.`;

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
