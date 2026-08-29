const { MODEL_TEXT, MODEL_TEXT_FALLBACK, CORS, json, callGemini, extractText, tryParseJson } = require('./_lib');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'الطريقة غير مسموحة' });

  try {
    const { points } = JSON.parse(event.body || '{}');
    if (!points || !points.length) return json(400, { error: 'لا يوجد ملخص لتحويله إلى شرائح.' });

    const prompt = `حوّل النقاط التالية إلى شرائح عرض تقديمي بالعربية. لكل نقطة أنشئ شريحة بعنوان قصير جذاب (3-6 كلمات) ومحتوى هو شرح للنقطة بجملتين إلى ثلاث جمل مناسبة للسرد الصوتي. أعد النتيجة بصيغة JSON فقط بهذا الشكل:
{"slides": [{"title": "عنوان الشريحة", "content": "نص الشريحة الذي سيُروى صوتيًا"}]}

النقاط:
${points.map((p, i) => `${i + 1}. ${p}`).join('\n')}`;

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    };

    const data = await callGemini(MODEL_TEXT, MODEL_TEXT_FALLBACK, payload);
    const result = tryParseJson(extractText(data));
    return json(200, result);
  } catch (err) {
    return json(500, { error: err.message });
  }
};
