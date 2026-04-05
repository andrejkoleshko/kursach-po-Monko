// ============================
// SMTP пресеты
// ============================
const SMTP_PRESETS = {
  "gmail.com": { host: "smtp.gmail.com", port: 465, secure: true },
  "yandex.ru": { host: "smtp.yandex.ru", port: 465, secure: true },
  "ya.ru": { host: "smtp.yandex.ru", port: 465, secure: true },
  "yandex.by": { host: "smtp.yandex.ru", port: 465, secure: true },
  "mail.ru": { host: "smtp.mail.ru", port: 465, secure: true },
  "bk.ru": { host: "smtp.mail.ru", port: 465, secure: true },
  "inbox.ru": { host: "smtp.mail.ru", port: 465, secure: true },
  "list.ru": { host: "smtp.mail.ru", port: 465, secure: true },
  "outlook.com": { host: "smtp.office365.com", port: 587, secure: false },
  "hotmail.com": { host: "smtp.office365.com", port: 587, secure: false },
  "proton.me": { host: "smtp.protonmail.ch", port: 465, secure: true },
};

// ============================
// API
// ============================
const api = {
  async login(username, password) {
    const res = await fetch('/api/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Неверный логин или пароль');
    }
  },

  async register(username, email, password, smtp) {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({
        username,
        email,
        password,
        smtp_host: smtp.host,
        smtp_port: smtp.port,
        smtp_secure: smtp.secure,
        smtp_user: smtp.user,
        smtp_pass: smtp.pass,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Ошибка регистрации');
    }
  },

  async checkAuth() {
    const res = await fetch('/api/documents', {
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    });
    return res.ok;
  },

  async getCategories() {
    const res = await fetch('/api/categories', {
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    });
    if (!res.ok) throw new Error('Ошибка загрузки категорий');
    return res.json();
  },

  uploadFilesXHR(files, onProgress) {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append('files', file));

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload');
      xhr.withCredentials = true;
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress(percent);
        }
      };

      xhr.onload = () => {
        if (xhr.status === 201) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          let msg = 'Ошибка загрузки файлов';
          try {
            const data = JSON.parse(xhr.responseText);
            if (data.error) msg = data.error;
          } catch {}
          reject(new Error(msg));
        }
      };

      xhr.onerror = () => reject(new Error('Ошибка сети при загрузке'));

      xhr.send(formData);
    });
  },

  async getDocuments({ category = 'all', q = '' } = {}) {
    const params = new URLSearchParams();
    if (category && category !== 'all') params.set('category', category);
    if (q) params.set('q', q);

    const res = await fetch(`/api/documents?${params.toString()}`, {
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    });
    if (!res.ok) throw new Error('Ошибка загрузки документов');
    return res.json();
  },

  async updateDocument(id, { category, description }) {
    const res = await fetch(`/api/documents/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({ category, description }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Ошибка обновления документа');
    }
    return res.json();
  },

  async deleteDocument(id) {
    const res = await fetch(`/api/documents/${id}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Ошибка удаления документа');
    }
    return res.json();
  },
};

// ============================
// Переключение экранов
// ============================
const loginPage = document.getElementById('login-page');
const registerPage = document.getElementById('register-page');
const appPage = document.getElementById('app-page');

function showLogin() {
  loginPage.classList.remove('hidden');
  registerPage.classList.add('hidden');
  appPage.classList.add('hidden');
}

function showRegister() {
  loginPage.classList.add('hidden');
  registerPage.classList.remove('hidden');
  appPage.classList.add('hidden');
}

function showApp() {
  loginPage.classList.add('hidden');
  registerPage.classList.add('hidden');
  appPage.classList.remove('hidden');
}

// ============================
// Авторизация
// ============================
async function showAppIfAuthorized() {
  try {
    const ok = await api.checkAuth();
    if (ok) {
      showApp();
      await initApp();
    } else {
      showLogin();
    }
  } catch {
    showLogin();
  }
}

const loginUsername = document.getElementById('login-username');
const loginPassword = document.getElementById('login-password');

document.getElementById('login-btn').onclick = async () => {
  const u = loginUsername.value.trim();
  const p = loginPassword.value.trim();

  if (!u || !p) {
    alert('Введите логин и пароль');
    return;
  }

  try {
    await api.login(u, p);
    await showAppIfAuthorized();
  } catch (e) {
    alert(e.message);
  }
};

// ============================
// Регистрация + SMTP
// ============================
const regUsername = document.getElementById('reg-username');
const regEmail = document.getElementById('reg-email');
const regPassword = document.getElementById('reg-password');
const regPassword2 = document.getElementById('reg-password2');
const regSmtpHost = document.getElementById('reg-smtp-host');
const regSmtpPort = document.getElementById('reg-smtp-port');
const regSmtpSecure = document.getElementById('reg-smtp-secure');
const regSmtpUser = document.getElementById('reg-smtp-user');
const regSmtpPass = document.getElementById('reg-smtp-pass');

regEmail.addEventListener("input", () => {
  const email = regEmail.value.trim();
  const domain = email.split("@")[1];
  if (!domain) return;

  const preset = SMTP_PRESETS[domain.toLowerCase()];
  if (!preset) return;

  regSmtpHost.value = preset.host;
  regSmtpPort.value = preset.port;
  regSmtpSecure.value = preset.secure ? "true" : "false";
  regSmtpUser.value = email;
});

document.getElementById('reg-btn').onclick = async () => {
  const username = regUsername.value.trim();
  const email = regEmail.value.trim();
  const pass1 = regPassword.value.trim();
  const pass2 = regPassword2.value.trim();

  const smtpHost = regSmtpHost.value.trim();
  const smtpPort = Number(regSmtpPort.value.trim());
  const smtpSecure = regSmtpSecure.value === 'true';
  const smtpUser = regSmtpUser.value.trim();
  const smtpPass = regSmtpPass.value.trim();

  if (!username || !email || !pass1 || !pass2) {
    alert('Заполните логин, email и пароль');
    return;
  }

  if (!email.includes('@')) {
    alert('Введите корректный email');
    return;
  }

  if (pass1 !== pass2) {
    alert('Пароли не совпадают');
    return;
  }

  if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
    alert('Заполните SMTP‑настройки');
    return;
  }

  try {
    await api.register(username, email, pass1, {
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      user: smtpUser,
      pass: smtpPass,
    });
    alert('Регистрация успешна. Письмо отправлено на email. Подтвердите аккаунт.');
    showLogin();
  } catch (e) {
    alert(e.message);
  }
};

document.getElementById('go-register').onclick = showRegister;
document.getElementById('go-login').onclick = showLogin;

document.getElementById('logout-btn').onclick = async () => {
  try {
    await fetch('/api/logout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    });
  } catch (e) {
    console.error('Ошибка при выходе', e);
  }
  showLogin();
};

// ============================
// Состояние
// ============================
const state = {
  docs: [],
  categories: [],
  currentCategory: 'all',
  search: '',
  selectedFiles: [],
};

function formatSize(bytes) {
  if (bytes == null) return '';
  const units = ['Б', 'КБ', 'МБ', 'ГБ'];
  let size = bytes;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(1)} ${units[i]}`;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU');
}

// ============================
// Рендер категорий и документов
// ============================
function renderCategories() {
  const filterSelect = document.getElementById('category-filter');
  const modalSelect = document.getElementById('doc-category');

  filterSelect.innerHTML = '<option value="all">Все категории</option>';
  state.categories.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    filterSelect.appendChild(opt);
  });

  modalSelect.innerHTML = '';
  state.categories.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    modalSelect.appendChild(opt);
  });
}

function renderDocuments() {
  const tbody = document.getElementById('documents-table-body');
  tbody.innerHTML = '';

  if (!state.docs.length) {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td colspan="5" class="text-center text-muted py-4">Документов пока нет</td>';
    tbody.appendChild(tr);
    return;
  }

  state.docs.forEach((doc) => {
    const tr = document.createElement('tr');

    const nameTd = document.createElement('td');
    nameTd.className = 'file-name';
    nameTd.title = doc.original_name;
    nameTd.textContent = doc.original_name;
    tr.appendChild(nameTd);

    const catTd = document.createElement('td');
    catTd.innerHTML = `<span class="badge bg-secondary badge-category">${doc.category}</span>`;
    tr.appendChild(catTd);

    const sizeTd = document.createElement('td');
    sizeTd.textContent = formatSize(doc.size);
    tr.appendChild(sizeTd);

    const dateTd = document.createElement('td');
    dateTd.textContent = formatDate(doc.uploaded_at);
    tr.appendChild(dateTd);

    const actionsTd = document.createElement('td');
    actionsTd.className = 'text-end';
    actionsTd.innerHTML = `
      <div class="btn-group btn-group-sm" role="group">
        <button class="btn btn-outline-primary btn-edit">Редактировать</button>
        <a class="btn btn-outline-secondary" href="/files/${doc.filename}">Скачать</a>
        <button class="btn btn-outline-danger btn-delete">Удалить</button>
      </div>
    `;
    tr.appendChild(actionsTd);

    actionsTd.querySelector('.btn-edit').addEventListener('click', () =>
      openEditModal(doc),
    );
    actionsTd.querySelector('.btn-delete').addEventListener('click', () =>
      handleDelete(doc),
    );

    tbody.appendChild(tr);
  });
}

function openEditModal(doc) {
  document.getElementById('doc-id').value = doc.id;
  document.getElementById('doc-name').value = doc.original_name;
  document.getElementById('doc-category').value = doc.category;
  document.getElementById('doc-description').value = doc.description || '';

  const modalEl = document.getElementById('documentModal');
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
}

async function handleDelete(doc) {
  if (!confirm(`Удалить документ "${doc.original_name}"?`)) return;
  try {
    await api.deleteDocument(doc.id);
    await loadDocuments();
  } catch (e) {
    alert(e.message || 'Ошибка удаления документа');
  }
}

async function loadDocuments() {
  const docs = await api.getDocuments({
    category: state.currentCategory,
    q: state.search,
  });
  state.docs = docs;
  renderDocuments();
}

// ============================
// Drag & Drop + Preview
// ============================
function setupDragAndDrop() {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const preview = document.getElementById('preview');
  const uploadStatus = document.getElementById('upload-status');
  const progressBar = document.getElementById('upload-progress');

  dropZone.addEventListener('click', () => fileInput.click());

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');

    const files = [...e.dataTransfer.files];
    state.selectedFiles = files;

    fileInput.files = e.dataTransfer.files;

    preview.innerHTML = '';
    files.forEach((file) => {
      if (file.type.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        preview.appendChild(img);
      }
    });

    progressBar.style.width = '0%';

    if (files.length === 1) {
      uploadStatus.textContent = `Выбран файл: ${files[0].name}`;
    } else {
      uploadStatus.textContent = `Выбрано файлов: ${files.length} — ${files
        .map((f) => f.name)
        .join(', ')}`;
    }
  });

  fileInput.addEventListener('change', () => {
    const files = [...fileInput.files];
    state.selectedFiles = files;

    preview.innerHTML = '';
    files.forEach((file) => {
      if (file.type.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        preview.appendChild(img);
      }
    });

    progressBar.style.width = '0%';

    if (files.length === 1) {
      uploadStatus.textContent = `Выбран файл: ${files[0].name}`;
    } else {
      uploadStatus.textContent = `Выбрано файлов: ${files.length} — ${files
        .map((f) => f.name)
        .join(', ')}`;
    }
  });
}

// ============================
// Инициализация приложения
// ============================
async function initApp() {
  try {
    state.categories = await api.getCategories();
    renderCategories();
    await loadDocuments();
  } catch (e) {
    console.error(e);
    alert('Не удалось загрузить данные с сервера');
  }

  setupDragAndDrop();
}

// ============================
// Загрузка файлов
// ============================
const uploadForm = document.getElementById('upload-form');
const fileInput = document.getElementById('file-input');
const uploadStatus = document.getElementById('upload-status');
const progressBar = document.getElementById('upload-progress');

uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const files = fileInput.files;
  if (!files.length) {
    uploadStatus.textContent = 'Выберите хотя бы один файл';
    return;
  }

   const existingNames = state.docs.map((d) => d.original_name.toLowerCase());
  for (const file of files) {
    if (existingNames.includes(file.name.toLowerCase())) {
      uploadStatus.textContent = `Файл "${file.name}" уже существует`;
      return;
    }
  }

  uploadStatus.textContent = 'Загрузка...';
  progressBar.style.width = '0%';

  try {
    await api.uploadFilesXHR(files, (percent) => {
      progressBar.style.width = percent + '%';
    });

    uploadStatus.textContent = 'Файлы успешно загружены';
    fileInput.value = '';
    state.selectedFiles = [];
    progressBar.style.width = '100%';

    await loadDocuments();
  } catch (err) {
    uploadStatus.textContent = err.message || 'Ошибка при загрузке';
  }
});

// ============================
// Фильтр и поиск
// ============================
document
  .getElementById('category-filter')
  .addEventListener('change', async (e) => {
    state.currentCategory = e.target.value;
    await loadDocuments();
  });

document
  .getElementById('search-input')
  .addEventListener('input', async (e) => {
    state.search = e.target.value.trim();
    await loadDocuments();
  });

// ============================
// Сохранение изменений документа
// ============================
document
  .getElementById('document-form')
  .addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = Number(document.getElementById('doc-id').value);
    const category = document.getElementById('doc-category').value;
    const description = document.getElementById('doc-description').value;

    try {
      await api.updateDocument(id, { category, description });
      const modalEl = document.getElementById('documentModal');
      const modal = bootstrap.Modal.getInstance(modalEl);
      modal.hide();
      await loadDocuments();
    } catch (err) {
      alert(err.message || 'Ошибка сохранения документа');
    }
  });

// ============================
// Старт
// ============================
document.addEventListener('DOMContentLoaded', showAppIfAuthorized);