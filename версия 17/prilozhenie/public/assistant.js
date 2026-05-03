let userAvatarUrl = null;

// Загружаем профиль пользователя
async function loadUserProfile() {
  try {
    const res = await fetch('/api/profile', { credentials: 'include' });
    if (res.ok) {
      const profile = await res.json();
      userAvatarUrl = profile.avatar_url || '/images/default-user.png';
    } else {
      userAvatarUrl = '/images/default-user.png';
    }
  } catch {
    userAvatarUrl = '/images/default-user.png';
  }
}

// Форматируем время
function formatTime(ts) {
  if (!ts) return '—';
  const date = new Date(ts);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Автопрокрутка вниз
function scrollChatToBottom() {
  const output = document.getElementById('assistant-output');
  output.scrollTo({ top: output.scrollHeight, behavior: 'smooth' });
}

// Индикатор загрузки
function showLoading() {
  const output = document.getElementById('assistant-output');
  const loading = document.createElement('div');
  loading.id = 'loading-indicator';
  loading.className = 'message-assistant';
  loading.innerHTML = `
    <div class="d-flex align-items-center">
      <img src="/images/assistant.png" class="avatar me-2">
      <div>
        <div class="spinner-border spinner-border-sm me-2" role="status"></div>
        Ассистент думает…
      </div>
    </div>
  `;
  output.appendChild(loading);
  scrollChatToBottom();
}

function hideLoading() {
  const loading = document.getElementById('loading-indicator');
  if (loading) loading.remove();
}

// Отправка вопроса
async function sendQuestion() {
  const input = document.getElementById('assistant-input');
  const question = input.value.trim();
  if (!question) return;

  const checkboxes = document.querySelectorAll('.doc-checkbox:checked');
  const docIds = Array.from(checkboxes).map(cb => Number(cb.value));

  const output = document.getElementById('assistant-output');
  const timeNow = formatTime(Date.now());

  // сообщение пользователя
  const userMsg = document.createElement('div');
  userMsg.className = 'message-user d-flex align-items-start justify-content-end';
  userMsg.innerHTML = `
    <div class="me-2 text-end">
      <div class="bubble-user">${question}</div>
      <div class="message-meta">${timeNow} <span class="status delivered">✔</span></div>
    </div>
    <img src="${userAvatarUrl}" class="avatar">
  `;
  output.appendChild(userMsg);

  setTimeout(() => {
    const statusEl = userMsg.querySelector('.status');
    if (statusEl) {
      statusEl.textContent = '✔✔';
      statusEl.classList.remove('delivered');
      statusEl.classList.add('read');
    }
  }, 2000);

  showLoading();

  const res = await fetch('/api/assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, docIds })
  });

  const data = await res.json();
  hideLoading();

  // ответ ассистента с Markdown
  const assistantMsg = document.createElement('div');
  assistantMsg.className = 'message-assistant d-flex align-items-start';
  assistantMsg.innerHTML = `
    <img src="/images/assistant.png" class="avatar me-2">
    <div>
      <div class="bubble-assistant">${marked.parse(data.answer || 'Нет ответа')}</div>
      <div class="message-docs">Документы: ${data.used_docs || 'нет'}</div>
      <div class="message-meta">${formatTime(data.created_at)}</div>
    </div>
  `;
  output.appendChild(assistantMsg);

  scrollChatToBottom();
  input.value = '';
  input.focus();
}

// Кнопка "Спросить"
document.getElementById('assistant-send').addEventListener('click', sendQuestion);

// Отправка по Enter
document.getElementById('assistant-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendQuestion();
  }
});

// Автопоиск по ключевым словам
document.getElementById('doc-search').addEventListener('input', async () => {
  const query = document.getElementById('doc-search').value.trim();
  const category = document.getElementById('doc-category').value;
  await loadDocuments(query, category);
});

document.getElementById('doc-category').addEventListener('change', async () => {
  const query = document.getElementById('doc-search').value.trim();
  const category = document.getElementById('doc-category').value;
  await loadDocuments(query, category);
});

// Загрузка списка документов
async function loadDocuments(query = '', category = 'all') {
  const res = await fetch(`/api/documents?q=${encodeURIComponent(query)}&category=${encodeURIComponent(category)}`);
  const docs = await res.json();
  const list = document.getElementById('documents-list');
  list.innerHTML = docs.map(d => `
    <div class="form-check">
      <input class="form-check-input doc-checkbox" type="checkbox" value="${d.id}" id="doc-${d.id}">
      <label class="form-check-label" for="doc-${d.id}">${d.original_name}</label>
    </div>
  `).join('');
}

// Загрузка истории
async function loadHistory() {
  const res = await fetch('/api/assistant/history');
  const history = await res.json();
  const output = document.getElementById('assistant-output');
  output.innerHTML = '';

  history.forEach(h => {
    const time = formatTime(h.created_at);

    const userMsg = document.createElement('div');
    userMsg.className = 'message-user d-flex align-items-start justify-content-end';
    userMsg.innerHTML = `
      <div class="me-2 text-end">
        <div class="bubble-user">${h.question}</div>
        <div class="message-meta">${time} <span class="status read">✔✔</span></div>
      </div>
      <img src="${userAvatarUrl}" class="avatar">
    `;
    output.appendChild(userMsg);

    const assistantMsg = document.createElement('div');
    assistantMsg.className = 'message-assistant d-flex align-items-start';
    assistantMsg.innerHTML = `
      <img src="/images/assistant.png" class="avatar me-2">
      <div>
        <div class="bubble-assistant">${marked.parse(h.answer)}</div>
        <div class="message-docs">Документы: ${h.used_docs || 'нет'}</div>
        <div class="message-meta">${time}</div>
      </div>
    `;
    output.appendChild(assistantMsg);
  });

  scrollChatToBottom();
}

// Инициализация
(async () => {
  await loadUserProfile();
  await loadDocuments();
  await loadHistory();
})();