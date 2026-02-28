import { useState } from 'react';
import { getProfilePicUrl } from '../api';
import { getInitials } from '../utils/formatters';

export default function ChatAvatar({ chatId, name, className, connected }) {
  const [imgFailed, setImgFailed] = useState(false);
  const src = connected && chatId ? getProfilePicUrl(chatId) : '';
  const showImg = src && !imgFailed;
  return (
    <span className={className}>
      {showImg ? (
        <img src={src} alt="" loading="lazy" onError={() => setImgFailed(true)} />
      ) : (
        getInitials(name || chatId || '?')
      )}
    </span>
  );
}
