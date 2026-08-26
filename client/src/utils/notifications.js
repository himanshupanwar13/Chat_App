export const STORAGE_KEY_NOTIFICATIONS = 'chatterflow_notifications_enabled';
export const STORAGE_KEY_SOUND = 'chatterflow_message_sound_enabled';

let audioContextInstance = null;

export const getAudioContext = () => {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioContextInstance) {
    try {
      audioContextInstance = new AudioContextClass();
    } catch {
      return null;
    }
  }
  return audioContextInstance;
};

export const unlockAudio = () => {
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  } catch {}
};

/**
 * Synthesizes a crisp, gentle two-tone chime via Web Audio API.
 * Zero external assets, zero network latency, zero bundle size overhead.
 */
export const playNotificationSound = () => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now); // E5

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880.0, now + 0.07); // A5

    gainNode.gain.setValueAtTime(0.001, now);
    gainNode.gain.linearRampToValueAtTime(0.18, now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.07);

    osc2.start(now + 0.07);
    osc2.stop(now + 0.35);
  } catch {
    // Autoplay restriction or audio failure - fail silently without throwing
  }
};

export const isNotificationSupported = () => {
  return typeof window !== 'undefined' && 'Notification' in window;
};

export const getNotificationPermission = () => {
  if (!isNotificationSupported()) return 'denied';
  try {
    return Notification.permission;
  } catch {
    return 'denied';
  }
};

export const requestNotificationPermission = async () => {
  if (!isNotificationSupported()) return 'denied';
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch {
    return 'denied';
  }
};

export const formatNotificationTitle = (messageData) => {
  return messageData?.user?.fullName || messageData?.senderName || 'ChatterFlow';
};

export const formatNotificationBody = (messageData) => {
  const text = String(messageData?.message || '').trim();
  const attachments = Array.isArray(messageData?.attachments) ? messageData.attachments : [];

  if (text) {
    return text.length > 100 ? `${text.slice(0, 97)}...` : text;
  }

  if (attachments.length > 0) {
    const first = attachments[0];
    const isImg = first.type === 'image' || first.mimeType?.startsWith('image/');
    if (isImg) {
      return '📷 Photo';
    }
    const docName = first.fileName || 'Document';
    return `📄 ${docName.length > 60 ? `${docName.slice(0, 57)}...` : docName}`;
  }

  return 'Sent a message';
};

export const showDesktopNotification = (messageData, { onNotificationClick } = {}) => {
  if (!isNotificationSupported() || getNotificationPermission() !== 'granted') {
    return null;
  }

  try {
    const title = formatNotificationTitle(messageData);
    const body = formatNotificationBody(messageData);
    const tag = `chatterflow-${messageData?.conversationId || messageData?._id || 'msg'}`;

    const notification = new Notification(title, {
      body,
      icon: '/favicon.ico',
      tag,
      renotify: true,
    });

    notification.onclick = () => {
      try {
        if (typeof window !== 'undefined') {
          window.focus();
        }
      } catch {}
      if (typeof onNotificationClick === 'function') {
        onNotificationClick(messageData);
      }
      try {
        notification.close();
      } catch {}
    };

    return notification;
  } catch {
    return null;
  }
};

export const isUserAway = (currentConversationId, incomingConversationId) => {
  if (typeof document === 'undefined') return true;
  const isTabHidden = document.visibilityState !== 'visible';
  const isDifferentChat =
    !currentConversationId ||
    String(currentConversationId) !== String(incomingConversationId);
  return isTabHidden || isDifferentChat;
};

