import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { io } from 'socket.io-client';
import OpusMediaRecorder from 'opus-media-recorder';
import {
  getWaStatus,
  getWaQr,
  waConnect,
  waDisconnect,
  getChats,
  getChatMessages,
  sendMessage,
  getMediaUrl,
  getProfilePicUrl,
  sendMedia,
} from '../api';
import './Dashboard.css';

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState('loading');
  const [qr, setQr] = useState(null);
  const [user, setUser] = useState(null);
  const [chats, setChats] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [newChatNumber, setNewChatNumber] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [pendingCaption, setPendingCaption] = useState('');
  const [recordingAudio, setRecordingAudio] = useState(false);
  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);
  const selectedChatIdRef = useRef(selectedChatId);
  const didAutoConnectRef = useRef(false);
  const mediaRecorderRef = useRef(null);
  const recordingChunksRef = useRef([]);
  selectedChatIdRef.current = selectedChatId;

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (u) setUser(JSON.parse(u));
  }, []);

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

  // Inicia a conexão com o WhatsApp automaticamente ao abrir a plataforma (uma vez por sessão)
  useEffect(() => {
    if (status === 'loading' || !user?.tenant?.id) return;
    if (!['none', 'disconnected', 'auth_failure'].includes(status)) return;
    if (didAutoConnectRef.current) return;
    didAutoConnectRef.current = true;
    const t = setTimeout(() => {
      waConnect().then(() => setStatus('initializing')).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [status, user?.tenant?.id]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const u = localStorage.getItem('user');
    if (!token || !u) return;
    const parsed = JSON.parse(u);
    const tenantId = parsed?.tenant?.id;
    if (!tenantId) return;

    const socket = io({ path: '/socket.io', auth: { tenantId } });
    socketRef.current = socket;

    socket.on('qr', (data) => {
      setQr(data.qr || null);
      setStatus('qr');
    });
    socket.on('ready', () => setStatus('connected'));
    socket.on('disconnected', () => setStatus('disconnected'));
    socket.on('auth_failure', () => setStatus('auth_failure'));
    socket.on('message', (payload) => {
      setMessages((prev) => {
        if (selectedChatIdRef.current !== payload.chatId) return prev;
        const existing = prev.find((m) => m.id === payload.id);
        if (existing) {
          return prev.map((m) =>
            m.id === payload.id ? { ...m, ...payload, ack: Math.max(m.ack ?? 0, payload.ack ?? 0) } : m
          );
        }
        const withoutOpt = payload.fromMe ? prev.filter((m) => !String(m.id).startsWith('opt-')) : prev;
        const ack = payload.fromMe ? Math.max(payload.ack ?? 0, 1) : (payload.ack ?? 0);
        return [...withoutOpt, { ...payload, ack }];
      });
      setChats((prev) => {
        const idx = prev.findIndex((c) => c.id === payload.chatId);
        let next;
        if (idx >= 0) {
          next = [...prev];
          next[idx] = { ...next[idx], lastMessage: { body: payload.body || '(mídia)', timestamp: payload.timestamp } };
        } else {
          next = [...prev, { id: payload.chatId, name: payload.chatId, isGroup: false, lastMessage: { body: payload.body || '(mídia)', timestamp: payload.timestamp } }];
        }
        next.sort((a, b) => (b.lastMessage?.timestamp || '').localeCompare(a.lastMessage?.timestamp || ''));
        return next;
      });
    });
    socket.on('message_ack', ({ messageId, chatId, ack }) => {
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.chatId === chatId && m.id === messageId);
        if (idx >= 0) {
          return prev.map((m, i) => (i === idx ? { ...m, ack } : m));
        }
        const optCandidates = prev
          .map((m, i) => ({ m, i }))
          .filter(({ m }) => m.chatId === chatId && m.fromMe && String(m.id).startsWith('opt-'));
        const optIdx = optCandidates.length > 0 ? optCandidates[optCandidates.length - 1].i : -1;
        if (optIdx >= 0) {
          return prev.map((m, i) =>
            i === optIdx ? { ...m, id: messageId, ack } : m
          );
        }
        return prev;
      });
    });

    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    if (['connected', 'disconnected', 'none'].includes(status)) {
      getChats().then(setChats).catch(() => setChats([]));
    }
  }, [status]);

  useEffect(() => {
    if (!selectedChatId) {
      setMessages([]);
      return;
    }
    getChatMessages(selectedChatId).then(setMessages).catch(() => setMessages([]));
  }, [selectedChatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleConnect = () => {
    waConnect().then(() => setStatus('initializing'));
  };

  const handleDisconnect = () => {
    waDisconnect().then(() => {
      setStatus('none');
      setQr(null);
      setChats([]);
      setSelectedChatId(null);
      setMessages([]);
    });
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login', { replace: true });
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || !selectedChatId || sending) return;
    setSending(true);
    setInputText('');
    const optimistic = {
      id: `opt-${Date.now()}`,
      chatId: selectedChatId,
      fromMe: true,
      body: text,
      type: 'chat',
      timestamp: new Date().toISOString(),
      hasMedia: false,
      ack: 0,
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const data = await sendMessage(selectedChatId, text);
      const realId = data?.id ? String(data.id) : null;
      if (realId) {
        setMessages((prev) => {
          const updated = prev.map((m) =>
            m.id === optimistic.id ? { ...m, id: realId, ack: 1 } : m
          );
          const stillHasOpt = updated.some((m) => m.id === optimistic.id);
          if (stillHasOpt) return updated;
          return prev.map((m) =>
            m.id === realId && m.chatId === selectedChatId ? { ...m, ack: Math.max(m.ack ?? 0, 1) } : m
          );
        });
      }
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInputText(text);
    } finally {
      setSending(false);
    }
  };

  const handleSendMedia = async (e) => {
    const file = e?.target?.files?.[0];
    if (!file || !selectedChatId || sending) return;
    setSending(true);
    try {
      await sendMedia(selectedChatId, file);
      setFileInputKey((k) => k + 1);
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  const sendOneMedia = async (file, caption = '') => {
    if (!selectedChatId || sending) return;
    setSending(true);
    try {
      await sendMedia(selectedChatId, file, caption);
      setFileInputKey((k) => k + 1);
    } catch (err) {
      console.error(err);
      throw err;
    } finally {
      setSending(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (selectedChatId && status === 'connected') setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (!selectedChatId || status !== 'connected' || sending) return;
    const items = e.dataTransfer?.files;
    if (!items?.length) return;
    const files = Array.from(items).filter((f) => f && f.name);
    if (!files.length) return;
    const withPreview = files.map((file) => {
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
      return { file, preview };
    });
    setPendingFiles((prev) => [...prev, ...withPreview]);
  };

  const removePendingFile = (index) => {
    setPendingFiles((prev) => {
      const next = prev.slice();
      const item = next[index];
      if (item?.preview) URL.revokeObjectURL(item.preview);
      next.splice(index, 1);
      return next;
    });
  };

  const clearPendingFiles = () => {
    pendingFiles.forEach((item) => {
      if (item.preview) URL.revokeObjectURL(item.preview);
    });
    setPendingFiles([]);
    setPendingCaption('');
  };

  const handleSendPendingFiles = async () => {
    if (!selectedChatId || !pendingFiles.length || sending) return;
    const caption = pendingCaption.trim();
    let failed = false;
    for (let i = 0; i < pendingFiles.length; i++) {
      try {
        await sendOneMedia(pendingFiles[i].file, i === 0 ? caption : '');
      } catch (err) {
        failed = true;
        const msg = err?.message || String(err);
        alert(`Falha ao enviar "${pendingFiles[i].file.name}": ${msg}`);
        break;
      }
    }
    if (!failed) clearPendingFiles();
  };

  const startRecording = async () => {
    if (!selectedChatId || status !== 'connected' || sending) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const base = window.location.origin || '';
      let recorder;
      let mimeType = 'audio/webm';
      try {
        const workerOptions = {
          encoderWorkerFactory: () => new Worker(`${base}/encoderWorker.umd.js`),
          OggOpusEncoderWasmPath: `${base}/OggOpusEncoder.wasm`,
          WebMOpusEncoderWasmPath: `${base}/WebMOpusEncoder.wasm`,
        };
        if (OpusMediaRecorder && OpusMediaRecorder.isTypeSupported && OpusMediaRecorder.isTypeSupported('audio/ogg')) {
          recorder = new OpusMediaRecorder(stream, { mimeType: 'audio/ogg' }, workerOptions);
          mimeType = 'audio/ogg';
        } else {
          throw new Error('Opus não disponível');
        }
      } catch (_) {
        mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
        recorder = new MediaRecorder(stream);
      }
      recordingChunksRef.current = [];
      const finalMime = mimeType;
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) recordingChunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setTimeout(() => {
          const chunks = recordingChunksRef.current;
          const mime = finalMime.split(';')[0];
          const blob = new Blob(chunks, { type: mime });
          if (blob.size === 0) {
            console.warn('Gravação vazia – tente gravar por mais tempo');
            return;
          }
          const ext = mime.includes('ogg') ? 'ogg' : 'webm';
          const file = new File([blob], `audio.${ext}`, { type: mime });
          setPendingFiles((prev) => [...prev, { file, preview: null }]);
        }, 80);
      };
      mediaRecorderRef.current = recorder;
      recorder.start(100);
      setRecordingAudio(true);
    } catch (err) {
      console.error('Erro ao acessar microfone:', err);
      alert('Não foi possível acessar o microfone. Verifique as permissões do navegador.');
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.requestData();
      } catch (_) {}
      recorder.stop();
      mediaRecorderRef.current = null;
    }
    setRecordingAudio(false);
  };

  const mediaUrl = (path) => getMediaUrl(path);

  const selectedChat = chats.find((c) => c.id === selectedChatId);

  function ChatAvatar({ chatId, name, className, connected }) {
    const [imgFailed, setImgFailed] = useState(false);
    const src = connected && chatId ? getProfilePicUrl(chatId) : '';
    const showImg = src && !imgFailed;
    return (
      <span className={className}>
        {showImg ? (
          <img src={src} alt="" onError={() => setImgFailed(true)} />
        ) : (
          getInitials(name || chatId || '?')
        )}
      </span>
    );
  }

  function getInitials(name) {
    if (!name || typeof name !== 'string') return '?';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
    return (name[0] || '?').toUpperCase();
  }

  function formatMessageTime(iso) {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Ontem';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }

  function formatChatId(number) {
    const digits = number.replace(/\D/g, '');
    if (digits.length <= 10) return `55${digits}@c.us`;
    return `${digits}@c.us`;
  }

  function handleStartNewChat() {
    const num = newChatNumber.trim();
    if (!num) return;
    const chatId = formatChatId(num);
    setChats((prev) => {
      const exists = prev.find((c) => c.id === chatId);
      if (exists) return prev;
      return [{ id: chatId, name: `Novo: ${num}`, isGroup: false, lastMessage: null }, ...prev];
    });
    setSelectedChatId(chatId);
    setNewChatNumber('');
    setShowNewChat(false);
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>WhatsApp Plataforma</h1>
        <div className="header-actions">
          <span className="user-info">
            {user?.email} {user?.tenant?.name && ` · ${user.tenant.name}`}
          </span>
          <button type="button" className="btn-logout" onClick={handleLogout}>
            Sair
          </button>
        </div>
      </header>

      {!['connected', 'disconnected', 'none'].includes(status) ? (
        <main className="dashboard-main">
          <section className="connection-card">
            <h2>Status da conexão</h2>
            <p className={`status-badge status-${status}`}>
              {status === 'loading' && 'Carregando...'}
              {status === 'none' && 'Não conectado'}
              {status === 'initializing' && 'Iniciando...'}
              {status === 'qr' && 'Escaneie o QR Code'}
              {status === 'authenticating' && 'Autenticando...'}
              {status === 'connected' && 'Conectado'}
              {status === 'disconnected' && 'Desconectado'}
              {status === 'auth_failure' && 'Falha na autenticação'}
              {status === 'error' && 'Erro'}
            </p>

            {status === 'qr' && qr && (
              <div className="qr-box">
                <QRCodeSVG value={qr} size={256} level="M" />
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

            {(status === 'initializing' || status === 'qr') && (
              <p className="hint">Aguarde o QR Code ou escaneie com seu celular.</p>
            )}
          </section>
        </main>
      ) : (
        <div className="dashboard-inbox">
          <nav className="nav-sidebar">
            <Link to="/" className={`nav-item ${location.pathname === '/' ? 'active' : ''}`} title="Conversas">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </Link>
            <Link to="/configuracoes" className={`nav-item ${location.pathname === '/configuracoes' ? 'active' : ''}`} title="Configurações">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </Link>
          </nav>
          <aside className="chat-list">
            {['disconnected', 'none'].includes(status) && (
              <div className="offline-banner">
                Histórico offline — conecte o WhatsApp para enviar e receber mensagens.
              </div>
            )}
            <div className="chat-list-header">
              <span>Conversas</span>
              <button type="button" className="btn-new-chat" onClick={() => setShowNewChat(!showNewChat)} title="Nova conversa">
                + Nova
              </button>
            </div>
            {showNewChat && (
              <div className="new-chat-form">
                <input
                  type="tel"
                  placeholder="Número (ex: 11 99999-9999)"
                  value={newChatNumber}
                  onChange={(e) => setNewChatNumber(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleStartNewChat()}
                />
                <button type="button" className="btn-start-chat" onClick={handleStartNewChat}>
                  Iniciar
                </button>
              </div>
            )}
            <div className="chat-list-scroll">
              {chats.length === 0 && !showNewChat && <p className="chat-list-empty">Nenhuma conversa</p>}
              {chats.map((chat) => (
              <button
                type="button"
                key={chat.id}
                className={`chat-list-item ${selectedChatId === chat.id ? 'selected' : ''}`}
                onClick={() => setSelectedChatId(chat.id)}
              >
                <ChatAvatar chatId={chat.id} name={chat.name} className="chat-avatar" connected={status === 'connected'} />
                <div className="chat-list-content">
                  <div className="chat-list-row">
                    <span className="chat-list-name">{chat.name || chat.id}</span>
                    {chat.lastMessage?.timestamp && (
                      <span className="chat-list-time">{formatMessageTime(chat.lastMessage.timestamp)}</span>
                    )}
                  </div>
                  {chat.lastMessage && (
                    <span className="chat-list-preview">{chat.lastMessage.body}</span>
                  )}
                </div>
              </button>
            ))}
            </div>
          </aside>
          <section className="chat-panel">
            {!selectedChatId ? (
              <div className="chat-placeholder">Selecione uma conversa</div>
            ) : (
              <div
                className={`chat-panel-dropzone ${dragOver ? 'drag-over' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="chat-header">
                  <ChatAvatar chatId={selectedChatId} name={selectedChat?.name} className="chat-header-avatar" connected={status === 'connected'} />
                  <div className="chat-header-info">
                    <span className="chat-header-name">{selectedChat?.name || selectedChatId}</span>
                    <span className="chat-header-status">WhatsApp</span>
                  </div>
                </div>
                <div className="chat-messages">
                  {messages.length > 0 && (
                    <div className="chat-date-sep">Hoje</div>
                  )}
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`chat-bubble ${msg.fromMe ? 'from-me' : 'from-them'}`}
                    >
                      {msg.hasMedia && msg.mediaPath ? (
                        <div className="bubble-media">
                          {msg.type && msg.type.startsWith('image') ? (
                            <img src={mediaUrl(msg.mediaPath)} alt="" />
                          ) : (msg.type === 'audio' || msg.type === 'ptt' || (msg.type && msg.type.startsWith('audio'))) ? (
                            <audio controls src={mediaUrl(msg.mediaPath)} />
                          ) : (msg.type && msg.type.startsWith('video')) ? (
                            <video controls src={mediaUrl(msg.mediaPath)} />
                          ) : (
                            <a href={mediaUrl(msg.mediaPath)} target="_blank" rel="noreferrer">
                              Baixar mídia
                            </a>
                          )}
                          {msg.body && <p>{msg.body}</p>}
                        </div>
                      ) : msg.hasMedia && !msg.mediaPath ? (
                        <p className="bubble-media-unavailable">
                          {msg.type && msg.type.startsWith('image')
                            ? '🖼️ Imagem (não disponível)'
                            : (msg.type === 'audio' || msg.type === 'ptt' || (msg.type && msg.type.startsWith('audio')))
                              ? '🎵 Áudio (não disponível)'
                              : (msg.type && msg.type.startsWith('video'))
                                ? '🎬 Vídeo (não disponível)'
                                : '📎 Mídia (não disponível)'}
                        </p>
                      ) : (
                        <p>{msg.body || '(vazio)'}</p>
                      )}
                      <div className="bubble-footer">
                        <span className="bubble-time">
                          {new Date(msg.timestamp).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {msg.fromMe && (
                          <span className={`bubble-ack ${(msg.ack ?? 0) >= 3 ? 'ack-read' : ''}`} title={(msg.ack ?? 0) >= 3 ? 'Lido' : (msg.ack ?? 0) >= 2 ? 'Entregue' : (msg.ack ?? 0) >= 1 ? 'Enviado' : 'Enviando'}>
                            {(msg.ack ?? 0) >= 2 ? (
                              <span className="ack-double">
                                <svg width="12" height="8" viewBox="0 0 12 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4l3 3 7-7"/></svg>
                                <svg width="12" height="8" viewBox="0 0 12 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4l3 3 7-7"/></svg>
                              </span>
                            ) : (msg.ack ?? 0) >= 1 ? (
                              <svg width="12" height="8" viewBox="0 0 12 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4l3 3 7-7"/></svg>
                            ) : (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/></svg>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
                {pendingFiles.length > 0 && (
                  <div className="chat-pending-files">
                    <div className="chat-pending-list">
                      {pendingFiles.map((item, i) => (
                        <div key={i} className="chat-pending-item">
                          {item.preview ? (
                            <img src={item.preview} alt="" className="chat-pending-thumb" />
                          ) : item.file.type.startsWith('audio/') ? (
                            <span className="chat-pending-icon">🎵</span>
                          ) : (
                            <span className="chat-pending-icon">📎</span>
                          )}
                          <span className="chat-pending-name" title={item.file.name}>{item.file.name}</span>
                          <button type="button" className="chat-pending-remove" onClick={() => removePendingFile(i)} title="Remover" aria-label="Remover">
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                    <input
                      type="text"
                      className="chat-pending-caption"
                      placeholder="Legenda (opcional)"
                      value={pendingCaption}
                      onChange={(e) => setPendingCaption(e.target.value)}
                    />
                    <div className="chat-pending-actions">
                      <button type="button" className="btn-cancel-pending" onClick={clearPendingFiles}>
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="btn-send-pending"
                        onClick={handleSendPendingFiles}
                        disabled={sending}
                      >
                        {sending ? 'Enviando...' : `Enviar ${pendingFiles.length} arquivo(s)`}
                      </button>
                    </div>
                  </div>
                )}
                <div className={`chat-input-row ${status !== 'connected' ? 'disabled' : ''}`}>
                  <label className="chat-attach" title="Anexar arquivo">
                    <input
                      type="file"
                      key={fileInputKey}
                      accept="image/*,audio/*,video/*,.pdf,.doc,.docx,text/plain"
                      onChange={handleSendMedia}
                      style={{ display: 'none' }}
                      disabled={status !== 'connected'}
                    />
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                  </label>
                  <button
                    type="button"
                    className={`chat-mic ${recordingAudio ? 'recording' : ''}`}
                    title={recordingAudio ? 'Parar gravação' : 'Enviar áudio'}
                    onClick={recordingAudio ? stopRecording : startRecording}
                    disabled={status !== 'connected' || sending}
                  >
                    {recordingAudio ? (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                    ) : (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                    )}
                  </button>
                  <input
                    type="text"
                    className="chat-input"
                    placeholder={status === 'connected' ? 'Digite uma mensagem aqui...' : 'Conecte o WhatsApp para enviar mensagens'}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    disabled={status !== 'connected'}
                  />
                  <button
                    type="button"
                    className="btn-send"
                    onClick={handleSend}
                    disabled={status !== 'connected' || !inputText.trim() || sending}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
