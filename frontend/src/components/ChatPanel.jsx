import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import ChatHeader from './ChatHeader';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';
import { getMediaUrl, searchChatMessages } from '../api';
import { formatDateSeparator } from '../utils/formatters';
import './ChatPanel.css';

function UploadProgressBar({ percent }) {
  if (percent === null || percent === undefined) return null;
  return (
    <div className="upload-progress-wrap">
      <div className="upload-progress-bar" style={{ width: `${percent}%` }} />
    </div>
  );
}

// Constrói lista de itens para o virtualizador (separadores de data + mensagens)
function buildVirtualItems(msgs) {
  const items = [];
  let lastDate = null;
  for (const msg of msgs) {
    const msgDate = new Date(msg.timestamp).toDateString();
    if (msgDate !== lastDate) {
      items.push({ type: 'date-sep', date: msg.timestamp, id: `date-${msgDate}` });
      lastDate = msgDate;
    }
    items.push({ type: 'message', msg, id: msg.id });
  }
  return items;
}

export default function ChatPanel({
  selectedChatId,
  selectedChat,
  messages,
  messagesEndRef,
  inputText,
  onInputChange,
  onSend,
  onAttach,
  onRecordStart,
  onRecordStop,
  recordingAudio,
  sending,
  status,
  pendingFiles,
  pendingCaption,
  onPendingCaptionChange,
  onRemovePendingFile,
  onClearPendingFiles,
  onSendPendingFiles,
  fileInputKey,
  dragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  typingIndicator,
  onBack,
  isMobile,
  onLoadMoreMessages,
  hasMoreMessages,
  loadingMore,
  messagesLoading,
  uploadProgress,
  messagesError,
  onRetryLoadMessages,
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchDebounceRef = useRef(null);

  const messagesContainerRef = useRef(null);
  const isAtBottomRef = useRef(true);
  const prevCountRef = useRef(0);

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setSearchLoading(true);
      searchChatMessages(selectedChatId, searchQuery)
        .then(setSearchResults)
        .catch(() => setSearchResults([]))
        .finally(() => setSearchLoading(false));
    }, 300);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [searchQuery, selectedChatId]);

  const displayMessages = searchQuery.trim() ? searchResults : messages;
  const virtualItems = buildVirtualItems(displayMessages);

  const virtualizer = useVirtualizer({
    count: virtualItems.length,
    getScrollElement: () => messagesContainerRef.current,
    estimateSize: (i) => {
      const item = virtualItems[i];
      if (!item) return 56;
      if (item.type === 'date-sep') return 32;
      const msg = item.msg;
      if (msg.hasMedia || msg.mediaPath) return 240;
      const bodyLen = (msg.body || '').length;
      if (bodyLen > 200) return 120;
      if (bodyLen > 80) return 80;
      return 56;
    },
    overscan: 12,
    measureElement: (el) => el?.getBoundingClientRect().height ?? 56,
  });

  const items = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  // Scroll para o final quando novas mensagens chegam e o usuário está no fundo
  useLayoutEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const newCount = virtualItems.length;
    const addedAtBottom = newCount > prevCountRef.current;
    prevCountRef.current = newCount;

    if (addedAtBottom && isAtBottomRef.current && newCount > 0) {
      virtualizer.scrollToIndex(newCount - 1, { align: 'end', behavior: 'smooth' });
    }
  }, [virtualItems.length]);

  // Detectar posição de scroll para saber se está no fundo e acionar "load more"
  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isAtBottomRef.current = distFromBottom < 80;

    if (!searchQuery.trim() && el.scrollTop < 150 && hasMoreMessages && !loadingMore && onLoadMoreMessages) {
      onLoadMoreMessages();
    }
  }, [hasMoreMessages, loadingMore, onLoadMoreMessages, searchQuery]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Scroll para o fundo ao trocar de chat
  useEffect(() => {
    if (!messagesLoading && virtualItems.length > 0) {
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(virtualItems.length - 1, { align: 'end' });
        isAtBottomRef.current = true;
      });
    }
  }, [selectedChatId, messagesLoading]);

  return (
    <section className="chat-panel">
      {!selectedChatId ? (
        <div className="chat-placeholder-simple">Selecione uma conversa</div>
      ) : (
        <div
          className={`chat-panel-dropzone ${dragOver ? 'drag-over' : ''}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <ChatHeader
            chatId={selectedChatId}
            chatName={selectedChat?.name}
            status={status}
            typingIndicator={typingIndicator}
            onBack={onBack}
            isMobile={isMobile}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            searchOpen={searchOpen}
            onSearchOpenChange={setSearchOpen}
          />

          <div
            className={`chat-messages ${messagesLoading ? 'chat-messages-loading' : ''}`}
            ref={messagesContainerRef}
          >
            {messagesLoading ? (
              <div className="chat-loading-initial">
                <div className="chat-loading-spinner" />
                <p>Carregando mensagens...</p>
              </div>
            ) : messagesError ? (
              <div className="chat-messages-error">
                <p>{messagesError}</p>
                {onRetryLoadMessages && (
                  <button type="button" className="btn-retry-messages" onClick={onRetryLoadMessages}>
                    Tentar novamente
                  </button>
                )}
              </div>
            ) : (
              <>
                {loadingMore && <div className="chat-loading-more">Carregando...</div>}
                {searchQuery.trim() && (
                  <div className="chat-search-info">
                    {searchLoading ? 'Buscando...' : `${searchResults.length} resultado(s)`}
                  </div>
                )}

                {/* Virtualizador de mensagens */}
                <div
                  className="messages-virtualizer"
                  style={{ height: `${totalSize}px` }}
                >
                  {items.map((vItem) => {
                    const item = virtualItems[vItem.index];
                    if (!item) return null;

                    return (
                      <div
                        key={item.id}
                        data-index={vItem.index}
                        ref={virtualizer.measureElement}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          transform: `translateY(${vItem.start}px)`,
                        }}
                      >
                        {item.type === 'date-sep' ? (
                          <div className="chat-date-sep">
                            {formatDateSeparator(item.date)}
                          </div>
                        ) : (
                          <div
                            className={`message-row ${item.msg.fromMe ? 'message-from-me' : 'message-from-them'}`}
                          >
                            <MessageBubble
                              msg={item.msg}
                              mediaUrl={getMediaUrl}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Âncora para scroll ao fundo */}
                <div ref={messagesEndRef} style={{ height: 1 }} />
              </>
            )}
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
                    <span className="chat-pending-name" title={item.file.name}>
                      {item.file.name}
                    </span>
                    <button
                      type="button"
                      className="chat-pending-remove"
                      onClick={() => onRemovePendingFile(i)}
                      title="Remover"
                      aria-label="Remover"
                    >
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
                onChange={(e) => onPendingCaptionChange(e.target.value)}
              />
              <div className="chat-pending-actions">
                <button type="button" className="btn-cancel-pending" onClick={onClearPendingFiles}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn-send-pending"
                  onClick={onSendPendingFiles}
                  disabled={sending}
                >
                  {sending ? 'Enviando...' : `Enviar ${pendingFiles.length} arquivo(s)`}
                </button>
              </div>
            </div>
          )}

          {uploadProgress !== null && uploadProgress !== undefined && uploadProgress < 100 && (
            <UploadProgressBar percent={uploadProgress} />
          )}
          <ChatInput
            inputText={inputText}
            onInputChange={onInputChange}
            onSend={onSend}
            onAttach={onAttach}
            onRecordStart={onRecordStart}
            onRecordStop={onRecordStop}
            recordingAudio={recordingAudio}
            sending={sending}
            disabled={status !== 'connected'}
            fileInputKey={fileInputKey}
          />
        </div>
      )}
    </section>
  );
}
