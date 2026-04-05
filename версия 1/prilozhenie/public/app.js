const api = {
  async getCategories() {
    const res = await fetch('/api/categories');
    if (!res.ok) throw new Error('Ошибка загрузки категорий');
    return res.json();
  },

  uploadFilesXHR(files, onProgress) {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append('files', file));

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload');

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress(percent);
        }
      };

      xhr.onload = () => {
        if (xhr.status === 201) {
          resolve(JSON.parse(xhr.responseText));
        } else if (xhr.status === 409) {
          reject(new Error(JSON.parse(xhr.responseText).error));
        } else {
          reject(new Error('Ошибка загрузки файлов'));
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
    const res = await fetch(`/api/documents?${params.toString()}`);
    if (!res.ok) throw new Error('Ошибка загрузки документов');
    return res.json();
  },

  async updateDocument(id, { category, description }) {
    const res = await fetch(`/api/documents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, description }),
    });
    if (!res.ok) throw new Error('Ошибка обновления документа');
    return res.json();
  },

  async deleteDocument(id) {
    const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Ошибка удаления документа');
    return res.json();
  },
};

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

// ---------------------------
// Drag & Drop + Preview + File Names
// ---------------------------
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

  // ---------------------------
  // Показываем имя при ручном выборе + сбрасываем прогресс
  // ---------------------------
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

async function init() {
  try {
    state.categories = await api.getCategories();
    renderCategories();
    await loadDocuments();
  } catch (e) {
    console.error(e);
    alert('Не удалось загрузить данные с сервера');
  }

  setupDragAndDrop();

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
}
document.addEventListener('DOMContentLoaded', init);