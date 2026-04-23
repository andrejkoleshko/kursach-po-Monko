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
    window.location.href = '/403.html';
    return;
  }

  const profile = await res.json();
  currentUser = profile;

  if (profile.role !== 'admin') {
    window.location.href = '/403.html';
    return;
  }

  // Если админ — показываем страницу
  document.body.style.visibility = 'visible';

  loadUsers();
  loadLimit();
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

  users.forEach(u => {
    const tr = document.createElement('tr');

    // Подсветка строки текущего пользователя
    if (currentUser && u.id === currentUser.id) {
      tr.style.backgroundColor = "#fff3cd"; // мягкий жёлтый
    }

    tr.innerHTML = `
      <td>${u.id}</td>
      <td>${u.username}</td>
      <td>${u.email}</td>
      <td>${u.is_active ? '✔' : '✘'}</td>

      <td>
        <select 
          onchange="changeRole(${u.id}, this.value)"
          ${currentUser && u.id === currentUser.id ? "disabled" : ""}
        >
          <option value="user" ${u.role === 'user' ? 'selected' : ''}>user</option>
          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option>
        </select>
      </td>

      <td>
        <button 
          onclick="deleteUser('${u.username}', ${u.id})"
          class="btn btn-danger btn-sm"
          ${currentUser && u.id === currentUser.id ? "disabled" : ""}
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
    showAlert('Ошибка удаления');
  }
}

async function changeRole(id, role) {
  if (id === currentUser.id) {
    showAlert("Нельзя изменить свою собственную роль");
    return;
  }

  const res = await fetch(`/api/admin/users/${id}/role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role })
  });

  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    showAlert(d.error || 'Ошибка изменения роли');
  } else {
    showAlert('Роль обновлена', 'success');
  }
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
