import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { io } from 'socket.io-client';
import { useTheme } from '../contexts/ThemeContext';
import {
  getWaStatus,
  getWaQr,
  waConnect,
  waDisconnect,
  getWaProfile,
  updateWaProfile,
  updateWaProfilePicture,
  getProfilePicUrl,
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  changeMyPassword,
} from '../api';
import './Settings.css';

const TABS = [
  { id: 'appearance', label: 'Aparência' },
  { id: 'connection', label: 'Conexão' },
  { id: 'profile', label: 'Perfil WhatsApp' },
  { id: 'users', label: 'Usuários' },
];

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const [tab, setTab] = useState('connection');
  const [status, setStatus] = useState('loading');
  const [qr, setQr] = useState(null);
  const [waProfile, setWaProfile] = useState(null);
  const [profileName, setProfileName] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profilePicFile, setProfilePicFile] = useState(null);
  const [profilePicSaving, setProfilePicSaving] = useState(false);
  const [users, setUsers] = useState([]);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [userCreating, setUserCreating] = useState(false);
  const [message, setMessage] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [currentUserId, setCurrentUserId] = useState(null);
  const [myPasswordCurrent, setMyPasswordCurrent] = useState('');
  const [myPasswordNew, setMyPasswordNew] = useState('');
  const [myPasswordConfirm, setMyPasswordConfirm] = useState('');
  const [passwordChanging, setPasswordChanging] = useState(false);

  function refreshStatus() {
    getWaStatus()
      .then((r) => setStatus(r.status))
      .catch(() => setStatus('none'));
  }

  useEffect(() => {
    refreshStatus();
  }, []);

  useEffect(() => {
    if (status === 'qr') {
      getWaQr().then((r) => setQr(r.qr || null)).catch(() => setQr(null));
    } else {
      setQr(null);
    }
  }, [status]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const u = localStorage.getItem('user');
    if (!token || !u) return;
    const parsed = JSON.parse(u);
    const tenantId = parsed?.tenant?.id;
    if (!tenantId) return;
    const socket = io({ path: '/socket.io', auth: { tenantId } });
    socket.on('qr', (data) => {
      setQr(data.qr || null);
      setStatus('qr');
    });
    socket.on('ready', () => setStatus('connected'));
    socket.on('disconnected', () => setStatus('disconnected'));
    socket.on('auth_failure', () => setStatus('auth_failure'));
    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    if (status === 'connected' && tab === 'profile') {
      getWaProfile()
        .then((p) => {
          setWaProfile(p);
          setProfileName(p.name || '');
        })
        .catch(() => setWaProfile(null));
    }
  }, [status, tab]);

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (u) {
      try {
        const parsed = JSON.parse(u);
        setCurrentUserId(parsed?.id || null);
      } catch (_) {}
    }
  }, []);

  useEffect(() => {
    if (tab === 'users') {
      getUsers()
        .then(setUsers)
        .catch(() => setUsers([]));
    }
  }, [tab]);

  function showMsg(text, isError = false) {
    setMessage({ text, isError });
    setTimeout(() => setMessage(null), 4000);
  }

  function handleConnect() {
    waConnect()
      .then(() => {
        setStatus('initializing');
        showMsg('Aguardando QR Code...');
      })
      .catch((e) => showMsg(e.message, true));
  }

  function handleDisconnect() {
    waDisconnect().then(() => {
      setStatus('disconnected');
      showMsg('Desconectado');
    }).catch((e) => showMsg(e.message, true));
  }

  function handleSaveProfile() {
    const name = profileName.trim();
    if (!name) {
      showMsg('Digite um nome', true);
      return;
    }
    setProfileSaving(true);
    updateWaProfile(name)
      .then(() => {
        setWaProfile((p) => (p ? { ...p, name } : null));
        showMsg('Nome atualizado');
      })
      .catch((e) => showMsg(e.message, true))
      .finally(() => setProfileSaving(false));
  }

  function handleProfilePicChange(e) {
    const file = e?.target?.files?.[0];
    if (file && file.type.startsWith('image/')) setProfilePicFile(file);
  }

  function handleUploadProfilePic() {
    if (!profilePicFile) {
      showMsg('Selecione uma imagem', true);
      return;
    }
    setProfilePicSaving(true);
    updateWaProfilePicture(profilePicFile)
      .then(() => {
        setProfilePicFile(null);
        showMsg('Foto atualizada');
      })
      .catch((e) => showMsg(e.message, true))
      .finally(() => setProfilePicSaving(false));
  }

  function handleCreateUser(e) {
    e.preventDefault();
    const email = newUserEmail.trim();
    const password = newUserPassword.trim();
    if (!email || !password) {
      showMsg('Email e senha são obrigatórios', true);
      return;
    }
    setUserCreating(true);
    createUser(email, password, newUserName.trim() || undefined)
      .then((data) => {
        setUsers((prev) => [...prev, data.user]);
        setNewUserEmail('');
        setNewUserPassword('');
        setNewUserName('');
        showMsg('Usuário criado');
      })
      .catch((e) => showMsg(e.message, true))
      .finally(() => setUserCreating(false));
  }

  function handleEditUser(u) {
    setEditingUser(u);
    setEditName(u.name || '');
    setEditEmail(u.email || '');
  }

  function handleSaveEdit(e) {
    e.preventDefault();
    if (!editingUser) return;
    const name = editName.trim();
    const email = editEmail.trim().toLowerCase();
    if (!email) {
      showMsg('Email é obrigatório', true);
      return;
    }
    updateUser(editingUser.id, { name: name || null, email })
      .then((data) => {
        setUsers((prev) => prev.map((u) => (u.id === editingUser.id ? data.user : u)));
        setEditingUser(null);
        showMsg('Usuário atualizado');
      })
      .catch((e) => showMsg(e.message, true));
  }

  function handleDeleteUser(u) {
    if (!window.confirm(`Remover ${u.email}?`)) return;
    deleteUser(u.id)
      .then(() => {
        setUsers((prev) => prev.filter((x) => x.id !== u.id));
        setEditingUser(null);
        showMsg('Usuário removido');
      })
      .catch((e) => showMsg(e.message, true));
  }

  function handleChangePassword(e) {
    e.preventDefault();
    if (myPasswordNew !== myPasswordConfirm) {
      showMsg('As senhas não coincidem', true);
      return;
    }
    if (myPasswordNew.length < 6) {
      showMsg('Senha deve ter pelo menos 6 caracteres', true);
      return;
    }
    setPasswordChanging(true);
    changeMyPassword(myPasswordCurrent, myPasswordNew)
      .then(() => {
        setMyPasswordCurrent('');
        setMyPasswordNew('');
        setMyPasswordConfirm('');
        showMsg('Senha alterada com sucesso');
      })
      .catch((e) => showMsg(e.message, true))
      .finally(() => setPasswordChanging(false));
  }

  return (
    <div className="settings-page">
      <header className="settings-header">
        <div className="settings-header-left">
          <Link to="/" className="settings-back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            Conversas
          </Link>
          <h1>Configurações</h1>
        </div>
      </header>

      {message && (
        <div className={`settings-toast ${message.isError ? 'error' : ''}`}>
          {message.text}
        </div>
      )}

      <nav className="settings-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`settings-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="settings-main">
        {tab === 'appearance' && (
          <section className="settings-card">
            <h2>Tema</h2>
            <div className="theme-toggle-row">
              <span>Tema escuro</span>
              <label className="theme-switch">
                <input
                  type="checkbox"
                  checked={theme === 'light'}
                  onChange={(e) => setTheme(e.target.checked ? 'light' : 'dark')}
                />
                <span className="theme-slider" />
              </label>
              <span>Tema claro</span>
            </div>
          </section>
        )}
        {tab === 'connection' && (
          <section className="settings-card">
            <h2>Conexão WhatsApp</h2>
            <p className={`status-badge status-${status}`}>
              {status === 'loading' && 'Carregando...'}
              {status === 'none' && 'Não conectado'}
              {status === 'initializing' && 'Iniciando...'}
              {status === 'qr' && 'Escaneie o QR Code'}
              {status === 'authenticating' && 'Autenticando...'}
              {status === 'connected' && 'Conectado'}
              {status === 'disconnected' && 'Desconectado'}
              {status === 'auth_failure' && 'Falha na autenticação'}
            </p>
            {status === 'qr' && qr && (
              <div className="qr-box">
                <QRCodeSVG value={qr} size={220} level="M" />
                <p>Abra o WhatsApp no celular → Dispositivos conectados → Conectar dispositivo</p>
              </div>
            )}
            {['none', 'disconnected', 'auth_failure'].includes(status) && (
              <button type="button" className="btn-connect" onClick={handleConnect}>
                Conectar WhatsApp
              </button>
            )}
            {status === 'connected' && (
              <button type="button" className="btn-disconnect" onClick={handleDisconnect}>
                Desconectar
              </button>
            )}
          </section>
        )}

        {tab === 'profile' && (
          <section className="settings-card">
            <h2>Perfil WhatsApp</h2>
            {status !== 'connected' ? (
              <p className="settings-hint">Conecte o WhatsApp para editar seu perfil.</p>
            ) : (
              <>
                <div className="profile-pic-row">
                  <div className="profile-pic-wrap">
                    {waProfile?.id ? (
                      <img
                        src={getProfilePicUrl(waProfile.id)}
                        alt=""
                        onError={(e) => {
                          e.target.style.display = 'none';
                          if (e.target.nextElementSibling) e.target.nextElementSibling.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <span className="profile-pic-fallback" style={{ display: waProfile?.id ? 'none' : 'flex' }}>
                      {waProfile?.name?.slice(0, 2)?.toUpperCase() || '?'}
                    </span>
                  </div>
                  <div className="profile-pic-actions">
                    <label className="btn-secondary">
                      <input type="file" accept="image/*" onChange={handleProfilePicChange} style={{ display: 'none' }} />
                      Escolher foto
                    </label>
                    {profilePicFile && (
                      <button type="button" className="btn-primary" onClick={handleUploadProfilePic} disabled={profilePicSaving}>
                        {profilePicSaving ? 'Enviando...' : 'Atualizar foto'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="form-group">
                  <label>Nome exibido</label>
                  <input
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder="Seu nome no WhatsApp"
                  />
                  <button type="button" className="btn-primary" onClick={handleSaveProfile} disabled={profileSaving}>
                    {profileSaving ? 'Salvando...' : 'Salvar nome'}
                  </button>
                </div>
                {waProfile?.number && (
                  <p className="profile-number">Número: {waProfile.number}</p>
                )}
              </>
            )}
          </section>
        )}

        {tab === 'users' && (
          <section className="settings-card settings-card-wide">
            <h2>Usuários da plataforma</h2>
            <p className="settings-hint">Usuários que podem acessar esta conta (tenant).</p>

            {currentUserId && (
              <div className="password-change-section">
                <h3>Trocar minha senha</h3>
                <form onSubmit={handleChangePassword} className="users-form">
                  <input
                    type="password"
                    placeholder="Senha atual"
                    value={myPasswordCurrent}
                    onChange={(e) => setMyPasswordCurrent(e.target.value)}
                    required
                  />
                  <input
                    type="password"
                    placeholder="Nova senha"
                    value={myPasswordNew}
                    onChange={(e) => setMyPasswordNew(e.target.value)}
                    required
                    minLength={6}
                  />
                  <input
                    type="password"
                    placeholder="Confirmar nova senha"
                    value={myPasswordConfirm}
                    onChange={(e) => setMyPasswordConfirm(e.target.value)}
                    required
                    minLength={6}
                  />
                  <button type="submit" className="btn-primary" disabled={passwordChanging}>
                    {passwordChanging ? 'Alterando...' : 'Alterar senha'}
                  </button>
                </form>
              </div>
            )}

            <ul className="users-list">
              {users.map((u) => (
                <li key={u.id} className="users-list-item">
                  <div className="user-info">
                    <span className="user-email">{u.email}</span>
                    {u.name && <span className="user-name">{u.name}</span>}
                  </div>
                  <div className="user-actions">
                    <button type="button" className="btn-icon" onClick={() => handleEditUser(u)} title="Editar">
                      ✏️
                    </button>
                    {u.id !== currentUserId && (
                      <button type="button" className="btn-icon btn-danger" onClick={() => handleDeleteUser(u)} title="Remover">
                        🗑️
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {editingUser && (
              <div className="modal-overlay" onClick={() => setEditingUser(null)}>
                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                  <h3>Editar usuário</h3>
                  <form onSubmit={handleSaveEdit}>
                    <input
                      type="email"
                      placeholder="Email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      required
                    />
                    <input
                      type="text"
                      placeholder="Nome (opcional)"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                    <div className="modal-actions">
                      <button type="button" className="btn-secondary" onClick={() => setEditingUser(null)}>
                        Cancelar
                      </button>
                      <button type="submit" className="btn-primary">Salvar</button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            <form className="users-form" onSubmit={handleCreateUser}>
              <h3>Novo usuário</h3>
              <input
                type="email"
                placeholder="Email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                required
              />
              <input
                type="password"
                placeholder="Senha"
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                required
              />
              <input
                type="text"
                placeholder="Nome (opcional)"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
              />
              <button type="submit" className="btn-primary" disabled={userCreating}>
                {userCreating ? 'Criando...' : 'Criar usuário'}
              </button>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}
