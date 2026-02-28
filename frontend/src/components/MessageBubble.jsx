import { useState, useRef, useEffect, useCallback } from 'react';
import { getMediaUrl } from '../api';

const MEDIA_TYPES = ['image', 'audio', 'video', 'ptt', 'sticker', 'document', 'album'];
function isMediaType(type) {
  if (!type) return false;
  const t = String(type).toLowerCase();
  return MEDIA_TYPES.some((m) => t === m || t.startsWith(m));
}

function isImage(type) {
  return type && String(type).toLowerCase().startsWith('image');
}
function isAudio(type) {
  const t = String(type || '').toLowerCase();
  return t === 'audio' || t === 'ptt' || t.startsWith('audio');
}
function isVideo(type) {
  return type && String(type).toLowerCase().startsWith('video');
}
function isDocument(type) {
  return type && (String(type).toLowerCase() === 'document' || String(type).toLowerCase() === 'application');
}

// ─── Lightbox ────────────────────────────────────────────────────────────────

function Lightbox({ src, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="lightbox-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <button className="lightbox-close" onClick={onClose} aria-label="Fechar">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
      <img
        className="lightbox-img"
        src={src}
        alt=""
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />
    </div>
  );
}

// ─── AudioPlayer ─────────────────────────────────────────────────────────────

function AudioPlayer({ src }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
  };

  const handleTimeUpdate = () => {
    setCurrentTime(audioRef.current?.currentTime || 0);
  };
  const handleLoadedMetadata = () => {
    const d = audioRef.current?.duration || 0;
    setDuration(isFinite(d) ? d : 0);
    setLoaded(true);
  };
  const handleEnded = () => setPlaying(false);
  const handlePlay = () => setPlaying(true);
  const handlePause = () => setPlaying(false);

  const handleSeek = (e) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    audio.currentTime = ratio * duration;
  };

  const fmt = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="audio-player">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onPlay={handlePlay}
        onPause={handlePause}
      />
      <button
        type="button"
        className="audio-play-btn"
        onClick={toggle}
        aria-label={playing ? 'Pausar' : 'Reproduzir'}
      >
        {playing ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>
      <div className="audio-track" onClick={handleSeek} role="slider" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
        <div className="audio-track-fill" style={{ width: `${progress}%` }} />
        <div className="audio-track-thumb" style={{ left: `${progress}%` }} />
      </div>
      <span className="audio-time">
        {loaded ? `${fmt(currentTime)} / ${fmt(duration)}` : '—'}
      </span>
    </div>
  );
}

// ─── MediaContent ─────────────────────────────────────────────────────────────

function MediaContent({ msg, mediaUrl }) {
  const [lightbox, setLightbox] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const url = mediaUrl(msg.mediaPath);

  if (isImage(msg.type)) {
    return (
      <>
        <div className={`media-img-wrapper ${imgLoaded ? 'loaded' : 'loading'}`}>
          {!imgLoaded && !imgError && <div className="media-skeleton" />}
          {imgError ? (
            <span className="bubble-media-unavailable">🖼️ Imagem indisponível</span>
          ) : (
            <img
              src={url}
              alt=""
              loading="lazy"
              className="bubble-image"
              onLoad={() => setImgLoaded(true)}
              onError={() => { setImgError(true); setImgLoaded(true); }}
              onClick={() => setLightbox(true)}
              style={{ cursor: 'zoom-in', display: imgLoaded && !imgError ? 'block' : 'none' }}
            />
          )}
        </div>
        {lightbox && <Lightbox src={url} onClose={() => setLightbox(false)} />}
      </>
    );
  }

  if (isAudio(msg.type)) {
    return <AudioPlayer src={url} />;
  }

  if (isVideo(msg.type)) {
    return (
      <video
        controls
        preload="metadata"
        className="bubble-video"
        style={{ maxWidth: '100%', borderRadius: '8px' }}
      >
        <source src={url} />
        Seu navegador não suporta vídeo.
      </video>
    );
  }

  // Documento / outros
  const filename = msg.mediaPath ? msg.mediaPath.split('/').pop() : 'arquivo';
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="bubble-doc-link"
      download
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <span>{filename}</span>
    </a>
  );
}

// ─── MediaUnavailable ─────────────────────────────────────────────────────────

function MediaUnavailable({ type }) {
  const label = isImage(type)
    ? 'Imagem indisponível'
    : isAudio(type)
      ? 'Áudio indisponível'
      : isVideo(type)
        ? 'Vídeo indisponível'
        : 'Arquivo indisponível';
  return (
    <div className="media-unavailable">
      <span>{label}</span>
    </div>
  );
}

// ─── MediaPending (mídia sendo baixada em background, timeout 30s) ─────────────

function MediaPending({ type }) {
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 30000);
    return () => clearTimeout(t);
  }, []);

  if (timedOut) return <MediaUnavailable type={type} />;

  const label = isImage(type)
    ? 'Baixando imagem...'
    : isAudio(type)
      ? 'Baixando áudio...'
      : isVideo(type)
        ? 'Baixando vídeo...'
        : 'Baixando arquivo...';
  return (
    <div className="media-pending">
      <div className="media-pending-spinner" />
      <span>{label}</span>
    </div>
  );
}

// ─── AckIcon ──────────────────────────────────────────────────────────────────

function AckIcon({ ack }) {
  if ((ack ?? 0) >= 2) {
    return (
      <span className={`bubble-ack ${(ack ?? 0) >= 3 ? 'ack-read' : ''}`} title={(ack ?? 0) >= 3 ? 'Lido' : 'Entregue'}>
        <span className="ack-double">
          <svg width="12" height="8" viewBox="0 0 12 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4l3 3 7-7" /></svg>
          <svg width="12" height="8" viewBox="0 0 12 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4l3 3 7-7" /></svg>
        </span>
      </span>
    );
  }
  if ((ack ?? 0) >= 1) {
    return (
      <span className="bubble-ack" title="Enviado">
        <svg width="12" height="8" viewBox="0 0 12 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4l3 3 7-7" /></svg>
      </span>
    );
  }
  return (
    <span className="bubble-ack" title="Enviando">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /></svg>
    </span>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

export default function MessageBubble({ msg, mediaUrl: mediaUrlFn, onReply }) {
  const [contextMenu, setContextMenu] = useState(null);
  const mediaUrl = mediaUrlFn || getMediaUrl;
  const hasMedia = !!(msg.hasMedia || isMediaType(msg.type));
  const hasPath = !!msg.mediaPath;
  const mediaError = !!msg.mediaError;

  const handleContextMenu = (e) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };
  const handleCopy = () => {
    if (msg.body) navigator.clipboard?.writeText(msg.body);
    setContextMenu(null);
  };
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  return (
    <>
      <div
        className={`chat-bubble ${msg.fromMe ? 'from-me' : 'from-them'}`}
        onContextMenu={handleContextMenu}
      >
        {hasMedia ? (
          <div className="bubble-media">
            {hasPath ? (
              <MediaContent msg={msg} mediaUrl={mediaUrl} />
            ) : mediaError ? (
              <MediaUnavailable type={msg.type} />
            ) : (
              <MediaPending type={msg.type} />
            )}
            {msg.body && <p className="bubble-caption">{msg.body}</p>}
          </div>
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
          {msg.fromMe && <AckIcon ack={msg.ack} />}
        </div>
      </div>

      {contextMenu && (
        <>
          <div
            className="context-menu-backdrop"
            onClick={closeContextMenu}
            onContextMenu={(e) => e.preventDefault()}
          />
          <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
            {msg.body && (
              <button type="button" onClick={handleCopy}>Copiar</button>
            )}
            {onReply && (
              <button type="button" onClick={() => { onReply(msg); setContextMenu(null); }}>
                Responder
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}
