import { useState } from 'react';
import ChatAvatar from './ChatAvatar';
import { formatMessageTime, formatChatId } from '../utils/formatters';
import './ChatList.css';

export default function ChatList({
  chats,
  selectedChatId,
  onSelectChat,
  status,
  searchQuery,
  onSearchChange,
  showNewChat,
  onToggleNewChat,
  newChatNumber,
  onNewChatNumberChange,
  onStartNewChat,
  offlineBanner,
}) {
  const filteredChats = searchQuery.trim()
    ? chats.filter((chat) => {
        const name = (chat.name || chat.id || '').toLowerCase();
        const id = (chat.id || '').toLowerCase();
        const q = searchQuery.toLowerCase();
        return name.includes(q) || id.includes(q);
      })
    : chats;

  return (
    <aside className="chat-list">
      {offlineBanner && <div className="offline-banner">{offlineBanner}</div>}
      <div className="chat-list-header">
        <div className="chat-list-header-row">
          <input
            type="text"
            className="chat-search-input"
            placeholder="Buscar ou iniciar nova conversa"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Buscar conversas"
          />
          <button
            type="button"
            className="btn-new-chat"
            onClick={() => onToggleNewChat(!showNewChat)}
            title="Nova conversa"
          >
            + Nova
          </button>
        </div>
      </div>
      {showNewChat && (
        <div className="new-chat-form">
          <input
            type="tel"
            placeholder="Número (ex: 11 99999-9999)"
            value={newChatNumber}
            onChange={(e) => onNewChatNumberChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onStartNewChat()}
          />
          <button type="button" className="btn-start-chat" onClick={onStartNewChat}>
            Iniciar
          </button>
        </div>
      )}
      <div className="chat-list-scroll">
        {filteredChats.length === 0 && !showNewChat && (
          <p className="chat-list-empty">
            {searchQuery.trim() ? 'Nenhum resultado encontrado' : 'Nenhuma conversa'}
          </p>
        )}
        {filteredChats.map((chat) => (
          <button
            type="button"
            key={chat.id}
            className={`chat-list-item ${selectedChatId === chat.id ? 'selected' : ''}`}
            onClick={() => onSelectChat(chat.id)}
          >
            <ChatAvatar
              chatId={chat.id}
              name={chat.name}
              className="chat-avatar"
              connected={status === 'connected'}
            />
            <div className="chat-list-content">
              <div className="chat-list-row">
                <span className="chat-list-name">{chat.name || chat.id}</span>
                {chat.lastMessage?.timestamp && (
                  <span className="chat-list-time">
                    {formatMessageTime(chat.lastMessage.timestamp)}
                  </span>
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
  );
}
