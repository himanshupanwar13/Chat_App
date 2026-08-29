export const STORAGE_KEY_NOTIFICATIONS = 'chatterflow_desktop_notifications_enabled';
export const STORAGE_KEY_SOUND = 'chatterflow_message_sound_enabled';

let audioContext = null;

export const unlockAudio = () => {
  if (typeof window === 'undefined') return;
  try {
    if (!audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        audioContext = new AudioCtx();
      }
    }
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume();
    }
  } catch (err) {
    // Ignore audio unlock errors
  }
};

export const playNotificationSound = () => {
  if (typeof window === 'undefined') return;
  try {
    unlockAudio();
    if (!audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        audioContext = new AudioCtx();
      }
    }
    if (!audioContext) return;

    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, audioContext.currentTime); // D5
    osc.frequency.setValueAtTime(880.0, audioContext.currentTime + 0.08); // A5

    gain.gain.setValueAtTime(0, audioContext.currentTime);
    gain.gain.linearRampToValueAtTime(0.2, audioContext.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.25);

    osc.connect(gain);
    gain.connect(audioContext.destination);

    osc.start(audioContext.currentTime);
    osc.stop(audioContext.currentTime + 0.25);
  } catch (err) {
    // Ignore sound playback errors
  }
};

export const isNotificationSupported = () => {
  return typeof window !== 'undefined' && 'Notification' in window;
};

export const getNotificationPermission = () => {
  if (!isNotificationSupported()) return 'denied';
  return Notification.permission;
};

export const requestNotificationPermission = async () => {
  if (!isNotificationSupported()) return 'denied';
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (err) {
    return 'denied';
  }
};

export const isUserAway = () => {
  if (typeof document === 'undefined') return false;
  return document.hidden || !document.hasFocus();
};

export const showDesktopNotification = ({ title, body, icon, onClick }) => {
  if (!isNotificationSupported()) return null;
  if (getNotificationPermission() !== 'granted') return null;

  try {
    const notification = new Notification(title || 'New Message on ChatterFlow', {
      body: body || '',
      icon: icon || '/favicon.ico',
      badge: '/favicon.ico',
      silent: true, // We handle custom Web Audio sound
    });

    if (typeof onClick === 'function') {
      notification.onclick = (event) => {
        window.focus();
        onClick(event);
        notification.close();
      };
    }

    return notification;
  } catch (err) {
    return null;
  }
};

