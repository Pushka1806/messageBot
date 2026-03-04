const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': MIME_TYPES['.json'] });
  res.end(JSON.stringify(payload));
}

function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        reject(new Error('Слишком большой запрос.'));
        req.destroy();
      }
    });

    req.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        resolve(parsed);
      } catch {
        reject(new Error('Некорректный JSON в теле запроса.'));
      }
    });

    req.on('error', () => reject(new Error('Ошибка чтения запроса.')));
  });
}

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

async function handleSend(req, res) {
  let data;

  try {
    data = await parseRequestBody(req);
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }

  const botToken = typeof data.botToken === 'string' ? data.botToken.trim() : '';
  const message = typeof data.message === 'string' ? data.message.trim() : '';
  const tgIds = Array.isArray(data.tgIds)
    ? data.tgIds.map((id) => String(id).trim()).filter(Boolean)
    : [];

  if (!botToken) {
    return sendJson(res, 400, { error: 'Укажите ключ бота.' });
  }

  if (!message) {
    return sendJson(res, 400, { error: 'Введите сообщение для рассылки.' });
  }

  if (!tgIds.length) {
    return sendJson(res, 400, { error: 'Список TG_ID пуст.' });
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

  return sendJson(res, 200, results);
}

function serveStatic(req, res) {
  const normalizedPath = req.url === '/' ? '/index.html' : req.url;
  const safePath = path.normalize(normalizedPath).replace(/^\.\.(\/|\\|$)/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/send') {
    handleSend(req, res);
    return;
  }

  if (req.method === 'GET') {
    serveStatic(req, res);
    return;
  }

  res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Method not allowed');
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
