const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('token');
}

export async function api(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export async function login(email, password, tenantSlug) {
  return api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, tenantSlug }),
  });
}

export async function register(email, password, name, tenantName) {
  return api('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name, tenantName }),
  });
}

export async function getWaStatus() {
  return api('/wa/status');
}

export async function getWaQr() {
  return api('/wa/qr');
}

export async function waConnect() {
  return api('/wa/connect', { method: 'POST' });
}

export async function waDisconnect() {
  return api('/wa/disconnect', { method: 'POST' });
}

export async function getWaProfile() {
  return api('/wa/profile');
}

export async function updateWaProfile(displayName) {
  return api('/wa/profile', {
    method: 'PATCH',
    body: JSON.stringify({ displayName }),
  });
}

export async function updateWaProfilePicture(file) {
  const token = getToken();
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/wa/profile-picture', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export async function getUsers() {
  const data = await api('/users');
  return data.users || [];
}

export async function createUser(email, password, name) {
  return api('/users', {
    method: 'POST',
    body: JSON.stringify({ email, password, name }),
  });
}

export async function getChats() {
  const data = await api('/wa/chats');
  return data.chats || [];
}

export async function getChatMessages(chatId) {
  const data = await api(`/wa/chats/${encodeURIComponent(chatId)}/messages`);
  return data.messages || [];
}

export async function sendMessage(chatId, text) {
  return api('/wa/send', {
    method: 'POST',
    body: JSON.stringify({ chatId, text }),
  });
}

export function getMediaUrl(path) {
  const token = getToken();
  return `/api/wa/media?path=${encodeURIComponent(path)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
}

export function getProfilePicUrl(chatId) {
  if (!chatId) return '';
  const token = getToken();
  return `/api/wa/profile-pic/${encodeURIComponent(chatId)}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
}

export async function getMediaBlobUrl(path) {
  const token = getToken();
  const url = `/api/wa/media?path=${encodeURIComponent(path)}`;
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error('Falha ao carregar mídia');
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function sendMedia(chatId, file, caption = '') {
  const token = getToken();
  const form = new FormData();
  form.append('chatId', chatId);
  form.append('file', file);
  if (caption) form.append('caption', caption);
  const res = await fetch('/api/wa/send-media', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
