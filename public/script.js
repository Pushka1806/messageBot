const form = document.querySelector('#mailer-form');
const fileInput = document.querySelector('#csv-file');
const countInfo = document.querySelector('#count-info');
const resultBlock = document.querySelector('#result');
const sendBtn = document.querySelector('#send-btn');

let tgIds = [];

function parseCsv(text) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = normalized.split('\n').map((row) => row.trim()).filter(Boolean);

  if (!rows.length) {
    throw new Error('CSV файл пуст.');
  }

  const headers = rows[0].split(';').length > rows[0].split(',').length
    ? rows[0].split(';').map((h) => h.trim())
    : rows[0].split(',').map((h) => h.trim());

  const delimiter = rows[0].includes(';') && !rows[0].includes(',') ? ';' : ',';
  const tgIndex = headers.findIndex((name) => name.toUpperCase() === 'TG_ID');

  if (tgIndex === -1) {
    throw new Error('В CSV не найдена колонка TG_ID.');
  }

  const ids = [];

  for (let i = 1; i < rows.length; i += 1) {
    const columns = rows[i].split(delimiter).map((col) => col.trim());
    if (columns[tgIndex]) {
      ids.push(columns[tgIndex]);
    }
  }

  return ids;
}

fileInput.addEventListener('change', async (event) => {
  const [file] = event.target.files;
  tgIds = [];

  if (!file) {
    countInfo.textContent = 'Файл не выбран.';
    return;
  }

  try {
    const text = await file.text();
    const ids = parseCsv(text);
    tgIds = [...new Set(ids)];
    countInfo.textContent = `Найдено получателей: ${tgIds.length}`;
  } catch (error) {
    countInfo.textContent = error.message;
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const botToken = document.querySelector('#bot-token').value.trim();
  const message = document.querySelector('#message').value.trim();

  if (!botToken || !message || !tgIds.length) {
    resultBlock.className = 'card error';
    resultBlock.innerHTML = '<p>Заполните ключ бота, загрузите CSV и введите сообщение.</p>';
    return;
  }

  sendBtn.disabled = true;
  sendBtn.textContent = 'Отправка...';
  resultBlock.className = 'card';
  resultBlock.classList.remove('hidden');
  resultBlock.innerHTML = '<p>Выполняется рассылка, пожалуйста подождите...</p>';

  try {
    const response = await fetch('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botToken, message, tgIds }),
    });

    const rawBody = await response.text();
    let payload;

    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      throw new Error(
        `Сервер вернул неожиданный ответ (не JSON). Код: ${response.status}. ${rawBody.slice(0, 180)}`,
      );
    }

    if (!response.ok) {
      throw new Error(payload.error || 'Не удалось отправить рассылку.');
    }

    const failedItems = payload.failures.length
      ? `<h3>Ошибки:</h3><ul>${payload.failures
          .map((item) => `<li>${item.id}: ${item.reason}</li>`)
          .join('')}</ul>`
      : '<p>Ошибок отправки нет.</p>';

    resultBlock.className = 'card success';
    resultBlock.innerHTML = `
      <h2>Готово</h2>
      <p>Всего получателей: <strong>${payload.total}</strong></p>
      <p>Успешно отправлено: <strong>${payload.success}</strong></p>
      <p>Ошибок: <strong>${payload.failed}</strong></p>
      ${failedItems}
    `;
  } catch (error) {
    resultBlock.className = 'card error';
    resultBlock.innerHTML = `<p>${error.message}</p>`;
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Отправить рассылку';
  }
});
