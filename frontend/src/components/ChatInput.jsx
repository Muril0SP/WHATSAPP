import { useState, useRef } from 'react';
import EmojiPicker from './EmojiPicker';

export default function ChatInput({
  inputText,
  onInputChange,
  onSend,
  onAttach,
  onRecordStart,
  onRecordStop,
  recordingAudio,
  sending,
  disabled,
  fileInputKey,
}) {
  const textareaRef = useRef(null);
  const emojiBtnRef = useRef(null);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const handleEmojiSelect = (emoji) => {
    onInputChange(inputText + emoji);
  };

  return (
    <div className={`chat-input-row ${disabled ? 'disabled' : ''}`}>
      <label className="chat-attach" title="Anexar arquivo">
        <input
          type="file"
          key={fileInputKey}
          accept="image/*,audio/*,video/*,.pdf,.doc,.docx,text/plain"
          onChange={onAttach}
          style={{ display: 'none' }}
          disabled={disabled}
        />
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
      </label>
      <div className="chat-emoji-wrapper" ref={emojiBtnRef}>
        <button
          type="button"
          className="chat-emoji-btn"
          title="Emoji"
          onClick={() => setEmojiOpen((v) => !v)}
          disabled={disabled}
        >
          😊
        </button>
        {emojiOpen && (
          <EmojiPicker
            onEmojiSelect={handleEmojiSelect}
            onClose={() => setEmojiOpen(false)}
            anchorRef={emojiBtnRef}
          />
        )}
      </div>
      <button
        type="button"
        className={`chat-mic ${recordingAudio ? 'recording' : ''}`}
        title={recordingAudio ? 'Parar gravação' : 'Enviar áudio'}
        onClick={recordingAudio ? onRecordStop : onRecordStart}
        disabled={disabled || sending}
      >
        {recordingAudio ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        )}
      </button>
      <textarea
        ref={textareaRef}
        className="chat-input chat-textarea"
        placeholder={disabled ? 'Conecte o WhatsApp para enviar mensagens' : 'Digite uma mensagem'}
        value={inputText}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        rows={1}
      />
      <button
        type="button"
        className="btn-send"
        onClick={onSend}
        disabled={disabled || !inputText.trim() || sending}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
        </svg>
      </button>
    </div>
  );
}
