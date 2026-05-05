let userAvatarUrl = null;
let userIsScrolling = false;
let wasNearBottom = true;
let savedScrollTop = 0;

function cleanText(str) {
  // удаляем китайские, японские, корейские иероглифы
  return str.replace(/[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g, '');
}

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

// Форматируем время (мессенджерный стиль)
function formatTime(ts) {
  if (!ts) return '—';
  const date = new Date(ts);
  if (isNaN(date.getTime())) return '—';

  const now = new Date();
  const d1 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const d2 = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((d1 - d2) / 86400000);

  const time = date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });

  if (diffDays === 0) return `Сегодня ${time}`;
  if (diffDays === 1) return `Вчера ${time}`;

  const fullDate = date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  return `${fullDate} ${time}`;
}

// Автопрокрутка вниз
function scrollChatToBottom(force = false) {
  const output = document.getElementById('assistant-output');
  if (!userIsScrolling || force) {
    output.scrollTo({ top: output.scrollHeight, behavior: 'smooth' });
  }
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

// Кнопки действий
function copyTextFromBubble(bubbleId) {
  const bubble = document.getElementById(bubbleId);
  if (bubble) {
    navigator.clipboard.writeText(bubble.innerText);
    alert('Скопировано как текст');
  }
}

function saveTextFromBubble(bubbleId) {
  const bubble = document.getElementById(bubbleId);
  if (bubble) {
    const blob = new Blob([bubble.innerText], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'assistant_answer.txt';
    link.click();
  }
}

function copyMarkdown(answer) {
  navigator.clipboard.writeText(decodeURIComponent(answer));
  alert('Скопировано как Markdown');
}

function saveMarkdown(answer) {
  const blob = new Blob([decodeURIComponent(answer)], { type: 'text/markdown' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'assistant_answer.md';
  link.click();
}

function saveHtml(bubbleId) {
  const bubble = document.getElementById(bubbleId);
  if (bubble) {
    const blob = new Blob([bubble.innerHTML], { type: 'text/html' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'assistant_answer.html';
    link.click();
  }
}

function sendText(text) {
  alert('Отправка: ' + decodeURIComponent(text));
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

  // временный ID для пользователя
  const tempId = `bubble-${Date.now()}-user`;

  // сообщение пользователя
  const userMsg = document.createElement('div');
  userMsg.className = 'message-user d-flex align-items-start justify-content-end';
  userMsg.innerHTML = `
    <div class="me-2 text-end">
      <div id="${tempId}" class="bubble-user">${cleanText(question)}</div>

      <div class="reaction-button" onclick="openReactionsMenu('${tempId}', event)">➕</div>
      <div class="message-reactions" id="react-${tempId}"></div>

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

  // реальные ID
  const realIdUser = `bubble-${data.id}-user`;
  const realIdAssistant = `bubble-${data.id}-assistant`;

  // обновляем временный ID у пользовательского сообщения
  const userBubble = document.getElementById(tempId);
  if (userBubble) {
    userBubble.id = realIdUser;
    const reactContainer = document.getElementById(`react-${tempId}`);
    if (reactContainer) reactContainer.id = `react-${realIdUser}`;
    const button = userBubble.parentElement.querySelector('.reaction-button');
    if (button) button.setAttribute('onclick', `openReactionsMenu('${realIdUser}', event)`);
  }

  // сообщение ассистента
  const assistantMsg = document.createElement('div');
  assistantMsg.className = 'message-assistant d-flex align-items-start';
  assistantMsg.innerHTML = `
    <img src="/images/assistant.png" class="avatar me-2">
    <div>
      <div id="${realIdAssistant}" class="bubble-assistant">${marked.parse(cleanText(data.answer || 'Нет ответа'))}</div>

      <div class="reaction-button" onclick="openReactionsMenu('${realIdAssistant}', event)">➕</div>
      <div class="message-reactions" id="react-${realIdAssistant}"></div>

      <div class="bubble-actions">
        <button onclick="copyTextFromBubble('${realIdAssistant}')">Текст</button>
        <button onclick="saveTextFromBubble('${realIdAssistant}')">TXT</button>
        <button onclick="copyMarkdown('${encodeURIComponent(data.answer)}')">MD копия</button>
        <button onclick="saveMarkdown('${encodeURIComponent(data.answer)}')">MD файл</button>
        <button onclick="saveHtml('${realIdAssistant}')">HTML файл</button>
        <button onclick="sendText('${encodeURIComponent(data.answer)}')">Отправить</button>
      </div>

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

// === Автопоиск по ключевым словам ===
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

// === Загрузка списка документов ===
async function loadDocuments(query = '', category = 'all') {
  const res = await fetch(`/api/documents?q=${encodeURIComponent(query)}&category=${encodeURIComponent(category)}`);
  const docs = await res.json();
  const list = document.getElementById('documents-list');
  list.innerHTML = docs.map(d => `
    <div class="form-check">
      <input class="form-check-input doc-checkbox" type="checkbox" value="${d.id}" id="doc-${d.id}">
      <label class="form-check-label assistant-file-name" for="doc-${d.id}" title="${d.original_name}">
        ${d.original_name}
      </label>
    </div>
  `).join('');
}

// === Загрузка истории ===
async function loadHistory() {
  const output = document.getElementById('assistant-output');

  // сохраняем позицию ДО очистки
  const savedScrollTop = output.scrollTop;
  const wasNearBottom = output.scrollHeight - output.scrollTop - output.clientHeight < 50;

  const res = await fetch('/api/assistant/history');
  const history = await res.json();

  // только теперь очищаем
  output.innerHTML = '';

  let lastDateLabel = null;
  let lastAuthor = null;

  history.forEach(h => {
    const msgDate = new Date(h.created_at);

    const rawDateLabel = msgDate.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    // Разделитель дат
    if (rawDateLabel !== lastDateLabel) {
      lastDateLabel = rawDateLabel;

      const divider = document.createElement('div');
      divider.className = 'chat-date-divider';

      const today = new Date().toLocaleDateString('ru-RU');
      const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('ru-RU');

      divider.innerText =
        rawDateLabel === today ? 'Сегодня' :
        rawDateLabel === yesterday ? 'Вчера' :
        rawDateLabel;

      output.appendChild(divider);
    }

    const time = formatTime(h.created_at);
    const bubbleId = `bubble-${h.id}`;

    // === Сообщение пользователя ===
    const hideUserAvatar = lastAuthor === 'user';

    const userMsg = document.createElement('div');
    userMsg.className = 'message-user d-flex align-items-start justify-content-end';
    userMsg.innerHTML = `
      <div class="me-2 text-end ${hideUserAvatar ? 'mt-0' : ''}">
        <div id="${bubbleId}-user" class="bubble-user">${cleanText(h.question)}</div>

        <div class="reaction-button" onclick="openReactionsMenu('${bubbleId}-user', event)">➕</div>
        <div class="message-reactions" id="react-${bubbleId}-user"></div>

        <div class="message-meta">${time} <span class="status read">✔✔</span></div>
      </div>
      ${hideUserAvatar ? '' : `<img src="${userAvatarUrl}" class="avatar">`}
    `;
    output.appendChild(userMsg);

    lastAuthor = 'user';

    // === Сообщение ассистента ===
    const hideAssistantAvatar = lastAuthor === 'assistant';

    // 🔥 Безопасный парсинг реакций
    let reactionsText = '';
    if (h.reaction) {
      try {
        const parsed = JSON.parse(h.reaction);
        if (Array.isArray(parsed)) {
          reactionsText = parsed.join(' ');
        } else {
          reactionsText = String(parsed);
        }
      } catch {
        reactionsText = h.reaction;
      }
    }

    const assistantMsg = document.createElement('div');
    assistantMsg.className = 'message-assistant d-flex align-items-start';
    assistantMsg.innerHTML = `
      ${hideAssistantAvatar ? '' : `<img src="/images/assistant.png" class="avatar me-2">`}
      <div class="${hideAssistantAvatar ? 'mt-0' : ''}">
        <div id="${bubbleId}" class="bubble-assistant">${marked.parse(cleanText(h.answer))}</div>

        <div class="reaction-button" onclick="openReactionsMenu('${bubbleId}', event)">➕</div>
        <div class="message-reactions" id="react-${bubbleId}">
          ${reactionsText}
        </div>

        <div class="bubble-actions">
          <button onclick="copyTextFromBubble('${bubbleId}')">Текст</button>
          <button onclick="saveTextFromBubble('${bubbleId}')">TXT</button>
          <button onclick="copyMarkdown('${encodeURIComponent(h.answer)}')">MD копия</button>
          <button onclick="saveMarkdown('${encodeURIComponent(h.answer)}')">MD файл</button>
          <button onclick="saveHtml('${bubbleId}')">HTML файл</button>
          <button onclick="sendText('${encodeURIComponent(h.answer)}')">Отправить</button>
        </div>

        <div class="message-docs">Документы: ${h.used_docs || 'нет'}</div>
        <div class="message-meta">${time}</div>
      </div>
    `;
    output.appendChild(assistantMsg);

    lastAuthor = 'assistant';
  });

  // 🔥 Восстановление позиции после полной отрисовки DOM
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (wasNearBottom) {
        scrollChatToBottom(true); // если был внизу — скроллим вниз
      } else {
        output.scrollTop = savedScrollTop; // иначе возвращаем прежнюю позицию
      }
    });
  });
}

// === Speech-to-Text ===
let recognition;
if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = 'ru-RU';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  document.getElementById('voice-record').addEventListener('click', () => {
    recognition.start();
    document.getElementById('recording-indicator').style.display = 'inline';
  });

  recognition.onresult = (event) => {
    document.getElementById('assistant-input').value = event.results[0][0].transcript;
  };

  recognition.onend = () => {
    document.getElementById('recording-indicator').style.display = 'none';
  };

  recognition.onerror = (event) => {
    document.getElementById('recording-indicator').style.display = 'none';

    let message;
    switch (event.error) {
      case 'network': message = 'Ошибка: нет связи с сервером распознавания речи.'; break;
      case 'no-speech': message = 'Ошибка: не удалось распознать речь.'; break;
      case 'aborted': message = 'Ошибка: распознавание прервано.'; break;
      default: message = 'Ошибка распознавания: ' + event.error;
    }

    const output = document.getElementById('assistant-output');
    const errorMsg = document.createElement('div');
    errorMsg.className = 'message-assistant text-danger';
    errorMsg.innerHTML = `
      <img src="/images/assistant.png" class="avatar me-2">
      <div>
        <div class="bubble-assistant">${message}</div>
        <div class="message-meta">${formatTime(Date.now())}</div>
      </div>
    `;
    output.appendChild(errorMsg);
    scrollChatToBottom();
  };
}

// === Text-to-Speech ===
document.getElementById('voice-play').addEventListener('click', () => {
  const bubbles = document.querySelectorAll('.bubble-assistant');
  if (bubbles.length > 0) {
    const lastAnswer = bubbles[bubbles.length - 1].innerText;
    const utterance = new SpeechSynthesisUtterance(lastAnswer);
    utterance.lang = 'ru-RU';
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  } else {
    alert('Нет ответа для озвучивания');
  }
});

document.getElementById('voice-stop').addEventListener('click', () => {
  speechSynthesis.cancel();
});


// === Реакции ===
let reactionMenuEl = null;

function toggleReaction(bubbleId, reaction) {
  // убираем суффиксы -user / -assistant
  let entryIdStr = bubbleId.replace('bubble-', '').replace('-user','').replace('-assistant','');
  const entryId = Number(entryIdStr);

  fetch('/api/assistant/reaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entryId, reaction })
  })
    .then(res => res.json())
    .then(data => {
      if (!data.ok) return;
      const container = document.getElementById(`react-${bubbleId}`);
      if (container) {
        container.textContent = data.reactions.join(' ');
      }
    });

  if (reactionMenuEl) {
    reactionMenuEl.remove();
    reactionMenuEl = null;
  }
}

function openReactionsMenu(bubbleId, event) {
  if (event) event.stopPropagation();

  if (reactionMenuEl) reactionMenuEl.remove();

  const bubble = document.getElementById(bubbleId);
  if (!bubble) return;

  reactionMenuEl = document.createElement('div');
  reactionMenuEl.className = 'reaction-menu';

  const reactions = ['👍', '❤️', '😂', '😮', '😢', '👎'];

  reactions.forEach(r => {
    const span = document.createElement('span');
    span.textContent = r;
    span.onclick = (e) => {
      e.stopPropagation();
      toggleReaction(bubbleId, r);
    };
    reactionMenuEl.appendChild(span);
  });

  const reactionsContainer = document.getElementById(`react-${bubbleId}`);
  if (reactionsContainer) {
    reactionsContainer.after(reactionMenuEl);
  }

  setTimeout(() => {
    document.addEventListener('click', closeMenuOnce, { once: true });
  }, 0);
}

function closeMenuOnce(e) {
  if (reactionMenuEl && !reactionMenuEl.contains(e.target)) {
    reactionMenuEl.remove();
    reactionMenuEl = null;
  }
}

const output = document.getElementById('assistant-output');

output.addEventListener('scroll', () => {
  const nearBottom = output.scrollHeight - output.scrollTop - output.clientHeight < 50;
  userIsScrolling = !nearBottom;
  wasNearBottom = nearBottom;
});

// === Инициализация ===
(async () => {
  await loadUserProfile();
  await loadDocuments();
  await loadHistory();
})();