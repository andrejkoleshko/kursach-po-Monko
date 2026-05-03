// ============================
// Уровни ролей
// ============================
const ROLE_LEVEL = {
  user: 1,
  support: 2,
  moderator: 3,
  manager: 4,
  admin: 5,
  superadmin: 6
};

// ============================
// Глобальная переменная текущего пользователя
// ============================
let currentUser = null;

// ============================
// Проверка роли перед загрузкой админки
// ============================
(async () => {
  const res = await fetch('/api/profile', {
    credentials: 'include',
    headers: { 'X-Requested-With': 'XMLHttpRequest' }
  });

  if (!res.ok) {
    window.location.href = '/403';
    return;
  }

  const profile = await res.json();
  currentUser = profile;

  // 🔥 В админку пускаем support и выше
  if (ROLE_LEVEL[profile.role] < ROLE_LEVEL['support']) {
    window.location.href = '/403';
    return;
  }

  document.body.style.visibility = 'visible';

  loadUsers();
  loadLimit();

  // 🔥 Скрываем блок лимита загрузки для support / moderator / manager
if (ROLE_LEVEL[currentUser.role] < ROLE_LEVEL['admin']) {
  const limitSection = document.getElementById('limit-section');
  if (limitSection) limitSection.style.display = 'none';
}

})();

// ============================
// Bootstrap‑alert
// ============================
function showAlert(message, type = "danger") {
  const container = document.getElementById("alert-container");
  const id = "alert-" + Date.now();

  container.insertAdjacentHTML(
    "beforeend",
    `
    <div id="${id}" class="alert alert-${type} alert-dismissible fade show shadow" role="alert">
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    </div>
    `
  );

  setTimeout(() => {
    const el = document.getElementById(id);
    if (el) el.classList.remove("show");
  }, 3000);
}

// ============================
// Работа с пользователями
// ============================
async function loadUsers() {
  const res = await fetch('/api/admin/users');
  const users = await res.json();
  const tbody = document.querySelector('#users-table tbody');
  tbody.innerHTML = '';

  const roleOptions = ['user', 'support', 'moderator', 'manager', 'admin', 'superadmin'];

  users.forEach(u => {
    const tr = document.createElement('tr');

    if (currentUser && u.id === currentUser.id) {
      tr.style.backgroundColor = "#fff3cd";
    }

    // 🔥 Логика полномочий
    let canDelete = ROLE_LEVEL[currentUser.role] > ROLE_LEVEL[u.role];
    let canChangeRole = ROLE_LEVEL[currentUser.role] > ROLE_LEVEL[u.role];


    // support — только смотреть
    if (ROLE_LEVEL[currentUser.role] < ROLE_LEVEL['moderator']) {
      canDelete = false;
      canChangeRole = false;
    }

    // moderator — может менять до moderator
    if (currentUser.role === 'moderator') {
      if (ROLE_LEVEL[u.role] >= ROLE_LEVEL['moderator']) {
        canChangeRole = false;
      }
    }

    // manager — может менять до manager
    if (currentUser.role === 'manager') {
      if (ROLE_LEVEL[u.role] >= ROLE_LEVEL['manager']) {
        canChangeRole = false;
      }
    }

    // admin — может менять до admin
    if (currentUser.role === 'admin') {
      if (ROLE_LEVEL[u.role] >= ROLE_LEVEL['admin']) {
        canChangeRole = false;
      }
    }

    // superadmin — может всё

    const optionsHtml = roleOptions.map(r => `
      <option value="${r}"
        ${u.role === r ? 'selected' : ''}
        ${ROLE_LEVEL[currentUser.role] <= ROLE_LEVEL[r] ? 'disabled' : ''}
      >
        ${r}
      </option>
    `).join('');

    tr.innerHTML = `
      <td>${u.id}</td>
      <td>${u.username}</td>
      <td>${u.email}</td>
      <td>${u.is_active ? '✔' : '✘'}</td>

      <td>
        <select 
          onchange="changeRole(${u.id}, this.value)"
          ${!canChangeRole ? "disabled" : ""}
        >
          ${optionsHtml}
        </select>
      </td>

      <td>
        <button 
          onclick="deleteUser('${u.username}', ${u.id})"
          class="btn btn-danger btn-sm"
          ${!canDelete ? "disabled" : ""}
        >
          Удалить
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

async function deleteUser(username, id) {
  if (id === currentUser.id) {
    showAlert("Нельзя удалить пользователя, под которым вы авторизованы");
    return;
  }

  if (!confirm('Удалить пользователя ' + username + '?')) return;

  const res = await fetch('/api/admin/users/' + username, { method: 'DELETE' });

  if (res.ok) {
    showAlert('Пользователь удалён', 'success');
    loadUsers();
  } else {
    const data = await res.json().catch(() => ({}));
    showAlert(data.error || 'Ошибка удаления');
  }
}

async function changeRole(id, role) {
  if (id === currentUser.id) {
    showAlert("Нельзя изменить свою собственную роль");
    return;
  }

  if (ROLE_LEVEL[role] >= ROLE_LEVEL[currentUser.role]) {
    showAlert("Нельзя назначить роль выше вашей");
    loadUsers();
    return;
  }

  const res = await fetch(`/api/admin/users/${id}/role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role })
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    showAlert(data.error || 'Ошибка изменения роли');
  } else {
    showAlert('Роль обновлена', 'success');
  }

  loadUsers();
}

// ============================
// Работа с лимитом загрузки
// ============================
async function loadLimit() {
  const res = await fetch('/api/admin/upload-limit');
  const data = await res.json();
  document.getElementById('limitRange').value = data.upload_limit_mb;
  document.getElementById('limitValue').textContent = data.upload_limit_mb + ' МБ';
}

document.getElementById('limitRange').addEventListener('input', (e) => {
  document.getElementById('limitValue').textContent = e.target.value + ' МБ';
});

document.getElementById('saveLimit').addEventListener('click', async () => {
  const raw = document.getElementById('limitRange').value;
  const value = Number(raw);

  if (isNaN(value) || value <= 0) {
    showAlert('Некорректное значение лимита');
    return;
  }

  try {
    const res = await fetch('/api/admin/upload-limit', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ upload_limit_mb: value })
    });

    if (res.ok) {
      showAlert('Лимит обновлён: ' + value + ' МБ', 'success');
    } else {
      const data = await res.json().catch(() => ({}));
      showAlert(data.error || 'Ошибка обновления лимита');
    }
  } catch (err) {
    showAlert('Ошибка сети при обновлении лимита');
  }
});