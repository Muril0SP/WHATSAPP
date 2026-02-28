import { useEffect, useRef } from 'react';

const EMOJIS = [
  '😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😍', '🥰', '😘', '😋', '😜',
  '👍', '👎', '👌', '✌️', '🤞', '🤝', '🙏', '💪', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
  '🔥', '⭐', '✨', '💯', '💬', '📱', '📞', '📧', '📨', '✉️', '📩', '📤', '📥', '🔔', '🔕', '📢',
  '✅', '❌', '❓', '❗', '⚠️', '💡', '🎉', '🎊', '🎁', '🏆', '🥇', '🥈', '🥉',
];

export default function EmojiPicker({ onEmojiSelect, onClose, anchorRef }) {
  const pickerRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target) && anchorRef?.current && !anchorRef.current.contains(e.target)) {
        onClose?.();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose, anchorRef]);

  return (
    <div ref={pickerRef} className="emoji-picker-popover">
      <div className="emoji-picker-grid">
        {EMOJIS.map((emoji, i) => (
          <button
            key={i}
            type="button"
            className="emoji-picker-item"
            onClick={() => onEmojiSelect(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
