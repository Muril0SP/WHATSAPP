import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
  sendMediaWithProgress,
} from '../api';
import { formatChatId } from '../utils/formatters';
import { playNotificationSound, requestNotificationPermission, showNotification } from '../utils/notifications';
import ConnectionCard from '../components/ConnectionCard';
import NavSidebar from '../components/NavSidebar';
import ChatList from '../components/ChatList';
import ChatPanel from '../components/ChatPanel';
import WelcomeScreen from '../components/WelcomeScreen';
import './Dashboard.css';

export default function Dashboard() {
  const navigate = useNavigate();
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
  const [searchQuery, setSearchQuery] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [pendingCaption, setPendingCaption] = useState('');
  const [recordingAudio, setRecordingAudio] = useState(false);
  const [typingIndicator, setTypingIndicator] = useState(null);
  const [chatListOpen, setChatListOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [uploadProgress, setUploadProgress] = useState(null);
  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);
  const selectedChatIdRef = useRef(selectedChatId);
  const didAutoConnectRef = useRef(false);
  const mediaRecorderRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const typingTimeoutRef = useRef(null);
  const typingEmitRef = useRef(null);
  selectedChatIdRef.current = selectedChatId;

  function sortMessages(msgs) {
    return [...msgs].sort((a, b) => {
      const ta = a.timestampMs ?? new Date(a.timestamp).getTime();
      const tb = b.timestampMs ?? new Date(b.timestamp).getTime();
      if (ta !== tb) return ta - tb;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
  }

  const emitTyping = () => {
    if (selectedChatId && status === 'connected' && socketRef.current) {
      socketRef.current.emit('typing', { chatId: selectedChatId });
    }
  };
  const emitTypingStop = () => {
    if (selectedChatId && socketRef.current) {
      socketRef.current.emit('typing_stop', { chatId: selectedChatId });
    }
  };

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (u) setUser(JSON.parse(u));
  }, []);

  const checkMobile = () => {
    setIsMobile(window.innerWidth < 768);
  };
  useEffect(() => {
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  function refreshStatus() {
    getWaStatus().then((r) => setStatus(r.status)).catch(() => setStatus('none'));
  }

  useEffect(() => {
    refreshStatus();
  }, []);

  useEffect(() => {
    if (status === 'connected') requestNotificationPermission();
  }, [status]);

  useEffect(() => {
    if (status === 'qr') {
      getWaQr().then((r) => setQr(r.qr || null)).catch(() => setQr(null));
    } else {
      setQr(null);
    }
  }, [status]);

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
    socket.on('typing', (data) => {
      if (selectedChatIdRef.current === data.chatId) {
        setTypingIndicator(data.name ? `${data.name} está digitando...` : 'Digitando...');
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setTypingIndicator(null), 3000);
      }
    });
    socket.on('typing_stop', (data) => {
      if (selectedChatIdRef.current === data.chatId) setTypingIndicator(null);
    });
    socket.on('message', (payload) => {
      if (!payload.fromMe) {
        if (document.hidden) {
          playNotificationSound();
          showNotification(payload.chatId, { body: (payload.body || '(mídia)').slice(0, 100) });
        } else if (selectedChatIdRef.current !== payload.chatId) {
          playNotificationSound();
        }
      }
      setMessages((prev) => {
        if (selectedChatIdRef.current !== payload.chatId) return prev;
        const existing = prev.find((m) => m.id === payload.id);
        if (existing) {
          return prev.map((m) =>
            m.id === payload.id ? { ...m, ...payload, ack: Math.max(m.ack ?? 0, payload.ack ?? 0) } : m
          );
        }
        const withoutOpt = payload.fromMe ? prev.filter((m) => !String(m.id).startsWith('opt-')) : prev;
        const ack = payload.fromMe ? Math.max(payload.ack ?? 0, 1) : payload.ack ?? 0;
        return sortMessages([...withoutOpt, { ...payload, ack }]);
      });
      setChats((prev) => {
        if (payload.chatId === 'status@broadcast') return prev;
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
        if (idx >= 0) return prev.map((m, i) => (i === idx ? { ...m, ack } : m));
        const optCandidates = prev
          .map((m, i) => ({ m, i }))
          .filter(({ m }) => m.chatId === chatId && m.fromMe && String(m.id).startsWith('opt-'));
        const optIdx = optCandidates.length > 0 ? optCandidates[optCandidates.length - 1].i : -1;
        if (optIdx >= 0) return prev.map((m, i) => (i === optIdx ? { ...m, id: messageId, ack } : m));
        return prev;
      });
    });

    // Atualiza bolha da mensagem quando mídia termina de baixar em background
    socket.on('media_ready', ({ messageId, chatId, mediaPath, mimeType }) => {
      if (selectedChatIdRef.current !== chatId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, mediaPath, mimeType: mimeType || m.mimeType }
            : m
        )
      );
    });

    return () => {
      socket.disconnect();
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (['connected', 'disconnected', 'none'].includes(status)) {
      getChats().then(setChats).catch(() => setChats([]));
    }
  }, [status]);

  const prevChatIdRef = useRef(selectedChatId);
  useEffect(() => {
    if (prevChatIdRef.current && socketRef.current) {
      socketRef.current.emit('typing_stop', { chatId: prevChatIdRef.current });
    }
    prevChatIdRef.current = selectedChatId;
    if (!selectedChatId) {
      setMessages([]);
      setHasMoreMessages(true);
      setMessagesLoading(false);
      return;
    }
    setHasMoreMessages(true);
    setMessagesLoading(true);
    getChatMessages(selectedChatId).then((msgs) => {
      setMessages(sortMessages(msgs));
      setHasMoreMessages(msgs.length >= 50);
    }).catch(() => setMessages([])).finally(() => setMessagesLoading(false));
  }, [selectedChatId]);

  const handleLoadMoreMessages = async () => {
    if (!selectedChatId || loadingMore || !hasMoreMessages || messages.length === 0) return;
    const oldest = messages[0]?.timestamp;
    if (!oldest) return;
    setLoadingMore(true);
    try {
      const older = await getChatMessages(selectedChatId, 50, oldest);
      setMessages((prev) => sortMessages([...older, ...prev]));
      setHasMoreMessages(older.length >= 50);
    } catch (_) {
      setHasMoreMessages(false);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleConnect = () => waConnect().then(() => setStatus('initializing'));
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

  useEffect(() => {
    if (!selectedChatId || !inputText.trim() || status !== 'connected') return;
    if (typingEmitRef.current) clearTimeout(typingEmitRef.current);
    typingEmitRef.current = setTimeout(() => {
      emitTyping();
      typingEmitRef.current = null;
    }, 500);
    return () => {
      if (typingEmitRef.current) clearTimeout(typingEmitRef.current);
    };
  }, [inputText, selectedChatId, status]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || !selectedChatId || sending) return;
    emitTypingStop();
    setSending(true);
    setInputText('');
    const now = Date.now();
    const optimistic = {
      id: `opt-${now}`,
      chatId: selectedChatId,
      fromMe: true,
      body: text,
      type: 'chat',
      timestamp: new Date(now).toISOString(),
      timestampMs: now,
      hasMedia: false,
      ack: 0,
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const data = await sendMessage(selectedChatId, text);
      const realId = data?.id ? String(data.id) : null;
      if (realId) {
        setMessages((prev) =>
          prev.map((m) => (m.id === optimistic.id ? { ...m, id: realId, ack: 1 } : m))
        );
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
    setUploadProgress(0);
    try {
      await sendMediaWithProgress(selectedChatId, file, '', (pct) => setUploadProgress(pct));
      setFileInputKey((k) => k + 1);
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
      setUploadProgress(null);
    }
  };

  const sendOneMedia = async (file, caption = '') => {
    if (!selectedChatId || sending) return;
    setSending(true);
    setUploadProgress(0);
    try {
      await sendMediaWithProgress(selectedChatId, file, caption, (pct) => setUploadProgress(pct));
      setFileInputKey((k) => k + 1);
    } catch (err) {
      console.error(err);
      throw err;
    } finally {
      setSending(false);
      setUploadProgress(null);
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
    const withPreview = files.map((file) => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
    }));
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
        alert(`Falha ao enviar "${pendingFiles[i].file.name}": ${err?.message || err}`);
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
        if (OpusMediaRecorder?.isTypeSupported?.('audio/ogg')) {
          recorder = new OpusMediaRecorder(stream, { mimeType: 'audio/ogg' }, workerOptions);
          mimeType = 'audio/ogg';
        } else throw new Error('Opus não disponível');
      } catch (_) {
        mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
        recorder = new MediaRecorder(stream);
      }
      recordingChunksRef.current = [];
      const finalMime = mimeType;
      recorder.ondataavailable = (ev) => {
        if (ev.data?.size > 0) recordingChunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setTimeout(() => {
          const chunks = recordingChunksRef.current;
          const mime = finalMime.split(';')[0];
          const blob = new Blob(chunks, { type: mime });
          if (blob.size > 0) {
            const ext = mime.includes('ogg') ? 'ogg' : 'webm';
            setPendingFiles((prev) => [...prev, { file: new File([blob], `audio.${ext}`, { type: mime }), preview: null }]);
          }
        }, 80);
      };
      mediaRecorderRef.current = recorder;
      recorder.start(100);
      setRecordingAudio(true);
    } catch (err) {
      alert('Não foi possível acessar o microfone. Verifique as permissões.');
    }
  };
  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder?.state !== 'inactive') {
      try { recorder.requestData(); } catch (_) {}
      recorder.stop();
      mediaRecorderRef.current = null;
    }
    setRecordingAudio(false);
  };

  const handleStartNewChat = () => {
    const num = newChatNumber.trim();
    if (!num) return;
    const chatId = formatChatId(num);
    setChats((prev) => {
      if (prev.find((c) => c.id === chatId)) return prev;
      return [{ id: chatId, name: `Novo: ${num}`, isGroup: false, lastMessage: null }, ...prev];
    });
    setSelectedChatId(chatId);
    setNewChatNumber('');
    setShowNewChat(false);
    if (isMobile) setChatListOpen(false);
  };

  const selectedChat = chats.find((c) => c.id === selectedChatId);

  const showConnectionCard = !['connected', 'disconnected', 'none'].includes(status);

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

      {showConnectionCard ? (
        <ConnectionCard
          status={status}
          qr={qr}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
        />
      ) : (
        <div className="dashboard-inbox">
          <NavSidebar />
          <div className={`chat-list-wrapper ${isMobile && selectedChatId && !chatListOpen ? 'hidden' : ''}`}>
            <ChatList
              chats={chats}
              selectedChatId={selectedChatId}
              onSelectChat={(id) => {
                setSelectedChatId(id);
                if (isMobile) setChatListOpen(false);
              }}
              status={status}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              showNewChat={showNewChat}
              onToggleNewChat={setShowNewChat}
              newChatNumber={newChatNumber}
              onNewChatNumberChange={setNewChatNumber}
              onStartNewChat={handleStartNewChat}
              offlineBanner={['disconnected', 'none'].includes(status) ? 'Histórico offline — conecte o WhatsApp para enviar e receber mensagens.' : null}
            />
          </div>
          <div className={`chat-panel-wrapper ${isMobile && selectedChatId ? 'expanded' : ''}`}>
            {!selectedChatId ? (
              <section className="chat-panel">
                <WelcomeScreen />
              </section>
            ) : (
              <ChatPanel
                selectedChatId={selectedChatId}
                selectedChat={selectedChat}
                messages={messages}
                messagesEndRef={messagesEndRef}
                inputText={inputText}
                onInputChange={setInputText}
                onSend={handleSend}
                onAttach={handleSendMedia}
                onRecordStart={startRecording}
                onRecordStop={stopRecording}
                recordingAudio={recordingAudio}
                sending={sending}
                status={status}
                pendingFiles={pendingFiles}
                pendingCaption={pendingCaption}
                onPendingCaptionChange={setPendingCaption}
                onRemovePendingFile={removePendingFile}
                onClearPendingFiles={clearPendingFiles}
                onSendPendingFiles={handleSendPendingFiles}
                fileInputKey={fileInputKey}
                dragOver={dragOver}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                typingIndicator={typingIndicator}
                onBack={() => setChatListOpen(true)}
                isMobile={isMobile}
                onLoadMoreMessages={handleLoadMoreMessages}
                hasMoreMessages={hasMoreMessages}
                loadingMore={loadingMore}
                messagesLoading={messagesLoading}
                uploadProgress={uploadProgress}
              />
            )}
          </div>
          {isMobile && selectedChatId && !chatListOpen && (
            <button
              type="button"
              className="mobile-back-fab"
              onClick={() => setChatListOpen(true)}
              aria-label="Voltar para conversas"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
