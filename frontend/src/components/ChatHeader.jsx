import { useState } from 'react';
import ChatAvatar from './ChatAvatar';

export default function ChatHeader({
  chatId,
  chatName,
  status,
  typingIndicator,
  onBack,
  isMobile,
  searchQuery,
  onSearchChange,
  searchOpen,
  onSearchOpenChange,
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="chat-header">
      {isMobile && (
        <button
          type="button"
          className="chat-header-back"
          onClick={onBack}
          aria-label="Voltar"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
      )}
      <ChatAvatar
        chatId={chatId}
        name={chatName}
        className="chat-header-avatar"
        connected={status === 'connected'}
      />
      <div className="chat-header-info">
        {!searchOpen ? (
          <>
            <span className="chat-header-name">{chatName || chatId}</span>
            <span className="chat-header-status">
              {typingIndicator ? typingIndicator : 'WhatsApp'}
            </span>
          </>
        ) : (
          <input
            type="text"
            className="chat-header-search-input"
            placeholder="Buscar mensagens..."
            value={searchQuery ?? ''}
            onChange={(e) => onSearchChange?.(e.target.value)}
            autoFocus
          />
        )}
      </div>
      <div className="chat-header-actions">
        {onSearchOpenChange && (
          <button
            type="button"
            className={`chat-header-icon ${searchOpen ? 'active' : ''}`}
            title="Buscar"
            aria-label="Buscar mensagens"
            onClick={() => onSearchOpenChange(!searchOpen)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </button>
        )}
        <button type="button" className="chat-header-icon" title="Chamada de voz" aria-label="Chamada de voz">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
        </button>
        <button type="button" className="chat-header-icon" title="Chamada de vídeo" aria-label="Chamada de vídeo">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 7l-7 5 7 5V7z" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
        </button>
        <div className="chat-header-menu-wrapper">
          <button
            type="button"
            className="chat-header-icon"
            title="Menu"
            aria-label="Menu"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="1" />
              <circle cx="19" cy="12" r="1" />
              <circle cx="5" cy="12" r="1" />
            </svg>
          </button>
          {menuOpen && (
            <>
              <div
                className="chat-menu-backdrop"
                onClick={() => setMenuOpen(false)}
              />
              <div className="chat-header-dropdown">
                <button type="button">Ver perfil</button>
                <button type="button">Silenciar notificações</button>
                <button type="button">Arquivar conversa</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
