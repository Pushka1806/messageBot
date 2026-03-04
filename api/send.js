async function sendTelegramMessage(botToken, chatId, message) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
    }),
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = { ok: false, description: 'Telegram вернул невалидный ответ.' };
  }

  if (!response.ok || !payload.ok) {
    throw new Error(payload.description || `HTTP ${response.status}`);
  }
}

function normalizeBody(req) {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      throw new Error('Некорректный JSON в теле запроса.');
    }
  }

  if (req.body && typeof req.body === 'object') {
    return req.body;
  }

  return {};
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let data;
  try {
    data = normalizeBody(req);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const botToken = typeof data.botToken === 'string' ? data.botToken.trim() : '';
  const message = typeof data.message === 'string' ? data.message.trim() : '';
  const tgIds = Array.isArray(data.tgIds)
    ? data.tgIds.map((id) => String(id).trim()).filter(Boolean)
    : [];

  if (!botToken) {
    return res.status(400).json({ error: 'Укажите ключ бота.' });
  }

  if (!message) {
    return res.status(400).json({ error: 'Введите сообщение для рассылки.' });
  }

  if (!tgIds.length) {
    return res.status(400).json({ error: 'Список TG_ID пуст.' });
  }

  const uniqueIds = [...new Set(tgIds)];
  const results = {
    total: uniqueIds.length,
    success: 0,
    failed: 0,
    failures: [],
  };

  for (const id of uniqueIds) {
    try {
      await sendTelegramMessage(botToken, id, message);
      results.success += 1;
    } catch (error) {
      results.failed += 1;
      results.failures.push({ id, reason: error.message });
    }
  }

  return res.status(200).json(results);
};
