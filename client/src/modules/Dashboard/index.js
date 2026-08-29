import Avatar from '../../components/Avatar';
import Input from '../../components/input';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { API_BASE_URL, SOCKET_URL } from '../../config';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Ban,
  Bell,
  BellOff,
  Camera,
  Check,
  CheckCheck,
  CheckCircle2,
  Download,
  File,
  FileArchive,
  FileSpreadsheet,
  FileText,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  MessageSquare,
  Moon,
  Palette,
  Paperclip,
  Pencil,
  Pin,
  PinOff,
  Reply,
  Search,
  SendHorizontal,
  Settings,
  Shield,
  Sun,
  Trash2,
  Upload,
  User,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  STORAGE_KEY_NOTIFICATIONS,
  STORAGE_KEY_SOUND,
  playNotificationSound,
  unlockAudio,
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  showDesktopNotification,
  isUserAway,
} from '../../utils/notifications';

const EMOJI_OPTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

const getAuthHeaders = () => {
  const token = localStorage.getItem('user:token');

  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const resolveMediaUrl = (url) => {
  if (!url) return '';
  if (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('blob:') ||
    url.startsWith('data:')
  ) {
    return url;
  }
  return `${API_BASE_URL.replace(/\/$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
};

const formatFileSize = (bytes) => {
  if (!bytes || isNaN(bytes)) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const Dashboard = () => {
  const navigate = useNavigate();

  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user:detail') || '{}');
    } catch (error) {
      return {};
    }
  });

  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState({
    messages: [],
    receiver: null,
    conversationId: null,
  });

  const [message, setMessage] = useState('');
  const [users, setUsers] = useState([]);
  const [socket, setSocket] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);

  // Search & Filter
  const [conversationSearch, setConversationSearch] = useState('');
  const [peopleSearch, setPeopleSearch] = useState('');

  // Pinning
  const [pinnedConversations, setPinnedConversations] = useState(() => {
    try {
      return JSON.parse(
        localStorage.getItem('chatterflow-pinned-chats') || '[]'
      );
    } catch (e) {
      return [];
    }
  });

  // Reply & Edit state
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);

  // Typing state
  const [typingData, setTypingData] = useState(null);

  // Reaction picker position
  const [reactionPickerPlacement, setReactionPickerPlacement] = useState({
    messageId: null,
    placement: 'above',
  });

  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);

  // UI States
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState(null);
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem('chatterflow-theme') === 'dark'
  );
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [showPeoplePanel, setShowPeoplePanel] = useState(false);

  // Pagination states & refs
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const chatContainerRef = useRef(null);
  const isPrependingRef = useRef(false);
  const prevScrollSnapshotRef = useRef(null);
  const loadingOlderRef = useRef(false);
  const isInitialLoadRef = useRef(true);

  const messageRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  // Attachment & Lightbox state
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [lightboxImage, setLightboxImage] = useState(null);

  useEffect(() => {
    return () => {
      if (filePreview?.url && filePreview.url.startsWith('blob:')) {
        URL.revokeObjectURL(filePreview.url);
      }
    };
  }, [filePreview]);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImage = file.type.startsWith('image/');
    const maxSize = isImage ? 10 * 1024 * 1024 : 25 * 1024 * 1024;
    if (file.size > maxSize) {
      setToast({
        type: 'error',
        message: `File exceeds maximum size limit of ${isImage ? '10 MB' : '25 MB'}.`,
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (filePreview?.url && filePreview.url.startsWith('blob:')) {
      URL.revokeObjectURL(filePreview.url);
    }

    const previewUrl = isImage ? URL.createObjectURL(file) : null;
    setSelectedFile(file);
    setFilePreview({
      url: previewUrl,
      type: isImage ? 'image' : 'file',
      name: file.name,
      size: file.size,
      mimeType: file.type,
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const clearSelectedFile = () => {
    if (filePreview?.url && filePreview.url.startsWith('blob:')) {
      URL.revokeObjectURL(filePreview.url);
    }
    setSelectedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // --------------------------------------------------
  // Notification & Sound State
  // --------------------------------------------------

  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem(STORAGE_KEY_NOTIFICATIONS);
    return (
      stored === 'true' &&
      isNotificationSupported() &&
      getNotificationPermission() === 'granted'
    );
  });

  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem(STORAGE_KEY_SOUND);
    return stored === null ? true : stored === 'true';
  });

  const [notificationPermission, setNotificationPermission] = useState(() => {
    return getNotificationPermission();
  });

  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const notifiedMessageIdsRef = useRef(new Set());
  const soundEnabledRef = useRef(soundEnabled);
  const notificationsEnabledRef = useRef(notificationsEnabled);
  const conversationsRef = useRef(conversations);
  const fetchMessagesRef = useRef(null);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    notificationsEnabledRef.current = notificationsEnabled;
  }, [notificationsEnabled]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  // Audio unlock listener for browser autoplay policies
  useEffect(() => {
    const handleUserInteraction = () => {
      unlockAudio();
    };
    window.addEventListener('click', handleUserInteraction, { once: true });
    window.addEventListener('keydown', handleUserInteraction, { once: true });
    window.addEventListener('touchstart', handleUserInteraction, { once: true });
    return () => {
      window.removeEventListener('click', handleUserInteraction);
      window.removeEventListener('keydown', handleUserInteraction);
      window.removeEventListener('touchstart', handleUserInteraction);
    };
  }, []);

  const handleToggleNotifications = async () => {
    if (!isNotificationSupported()) {
      setToast({
        type: 'error',
        message: 'Desktop notifications are not supported in this browser.',
      });
      return;
    }

    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      localStorage.setItem(STORAGE_KEY_NOTIFICATIONS, 'false');
      setToast({
        type: 'success',
        message: 'Desktop notifications disabled.',
      });
      return;
    }

    const currentPerm = getNotificationPermission();
    if (currentPerm === 'granted') {
      setNotificationsEnabled(true);
      setNotificationPermission('granted');
      localStorage.setItem(STORAGE_KEY_NOTIFICATIONS, 'true');
      setToast({
        type: 'success',
        message: 'Desktop notifications enabled!',
      });
      return;
    }

    if (currentPerm === 'denied') {
      setNotificationPermission('denied');
      setToast({
        type: 'error',
        message: 'Notifications are blocked. Please allow them in your browser site settings.',
      });
      return;
    }

    // Request permission upon explicit user action
    const newPerm = await requestNotificationPermission();
    setNotificationPermission(newPerm);

    if (newPerm === 'granted') {
      setNotificationsEnabled(true);
      localStorage.setItem(STORAGE_KEY_NOTIFICATIONS, 'true');
      setToast({
        type: 'success',
        message: 'Desktop notifications enabled!',
      });
    } else {
      setNotificationsEnabled(false);
      localStorage.setItem(STORAGE_KEY_NOTIFICATIONS, 'false');
      setToast({
        type: 'error',
        message: 'Notification permission was not granted.',
      });
    }
  };

  const handleToggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY_SOUND, String(next));
      if (next) {
        unlockAudio();
        playNotificationSound();
      }
      return next;
    });
  };

  const handleTestSound = () => {
    unlockAudio();
    playNotificationSound();
  };

  // --------------------------------------------------
  // Profile & Settings State
  // --------------------------------------------------

  const [settingsTab, setSettingsTab] = useState('profile'); // 'profile' | 'notifications' | 'appearance' | 'security' | 'account'
  const [displayNameInput, setDisplayNameInput] = useState(() => user?.fullName || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [removingAvatar, setRemovingAvatar] = useState(false);
  const avatarInputRef = useRef(null);

  // Security / Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (user?.fullName) {
      setDisplayNameInput(user.fullName);
    }
  }, [user?.fullName]);

  useEffect(() => {
    return () => {
      if (avatarPreview && avatarPreview.startsWith('blob:')) {
        URL.revokeObjectURL(avatarPreview);
      }
    };
  }, [avatarPreview]);

  const fetchUserProfile = useCallback(async () => {
    const token = localStorage.getItem('user:token');
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/profile`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setUser((prev) => {
          const updated = {
            ...prev,
            id: data._id || data.id,
            fullName: data.fullName,
            email: data.email,
            avatar: data.avatar,
            emailVerified: data.emailVerified,
            createdAt: data.createdAt,
          };
          localStorage.setItem('user:detail', JSON.stringify(updated));
          return updated;
        });
        setDisplayNameInput(data.fullName || '');
      }
    } catch (err) {
      console.error('Failed to sync profile:', err);
    }
  }, []);

  useEffect(() => {
    fetchUserProfile();
  }, [fetchUserProfile]);

  const handleAvatarSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      setToast({
        type: 'error',
        message: 'Avatar must be an image (JPEG, PNG, WebP, or GIF).',
      });
      if (avatarInputRef.current) avatarInputRef.current.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setToast({
        type: 'error',
        message: 'Image must be 5 MB or smaller.',
      });
      if (avatarInputRef.current) avatarInputRef.current.value = '';
      return;
    }

    if (avatarPreview && avatarPreview.startsWith('blob:')) {
      URL.revokeObjectURL(avatarPreview);
    }

    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  };

  const handleCancelAvatarPreview = () => {
    if (avatarPreview && avatarPreview.startsWith('blob:')) {
      URL.revokeObjectURL(avatarPreview);
    }
    setAvatarFile(null);
    setAvatarPreview(null);
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  };

  const handleUploadAvatar = async () => {
    if (!avatarFile) return;
    const token = localStorage.getItem('user:token');
    if (!token) return;

    try {
      setUploadingAvatar(true);
      const formData = new FormData();
      formData.append('avatar', avatarFile);

      const res = await fetch(`${API_BASE_URL}/api/profile/avatar`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload avatar.');
      }

      setUser((prev) => {
        const next = { ...prev, avatar: data.avatar };
        localStorage.setItem('user:detail', JSON.stringify(next));
        return next;
      });

      handleCancelAvatarPreview();
      setToast({
        type: 'success',
        message: 'Profile photo updated successfully!',
      });
    } catch (err) {
      setToast({
        type: 'error',
        message: err.message || 'Failed to upload avatar.',
      });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    const token = localStorage.getItem('user:token');
    if (!token) return;

    try {
      setRemovingAvatar(true);
      const res = await fetch(`${API_BASE_URL}/api/profile/avatar`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to remove avatar.');
      }

      setUser((prev) => {
        const next = { ...prev, avatar: null };
        localStorage.setItem('user:detail', JSON.stringify(next));
        return next;
      });

      handleCancelAvatarPreview();
      setToast({
        type: 'success',
        message: 'Profile photo removed successfully.',
      });
    } catch (err) {
      setToast({
        type: 'error',
        message: err.message || 'Failed to remove avatar.',
      });
    } finally {
      setRemovingAvatar(false);
    }
  };

  const handleSaveDisplayName = async (e) => {
    if (e) e.preventDefault();
    const trimmed = displayNameInput.trim();
    if (!trimmed || trimmed.length < 2 || trimmed.length > 50) {
      setToast({
        type: 'error',
        message: 'Full name must be between 2 and 50 characters.',
      });
      return;
    }

    const token = localStorage.getItem('user:token');
    if (!token) return;

    try {
      setSavingProfile(true);
      const res = await fetch(`${API_BASE_URL}/api/profile`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ fullName: trimmed }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update profile.');
      }

      setUser((prev) => {
        const next = { ...prev, fullName: trimmed };
        localStorage.setItem('user:detail', JSON.stringify(next));
        return next;
      });

      setToast({
        type: 'success',
        message: 'Profile name updated successfully!',
      });
    } catch (err) {
      setToast({
        type: 'error',
        message: err.message || 'Failed to update profile.',
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e) => {
    if (e) e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) {
      setToast({
        type: 'error',
        message: 'Please fill in all password fields.',
      });
      return;
    }

    if (newPassword.length < 6) {
      setToast({
        type: 'error',
        message: 'New password must be at least 6 characters long.',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setToast({
        type: 'error',
        message: 'New password and confirmation do not match.',
      });
      return;
    }

    if (currentPassword === newPassword) {
      setToast({
        type: 'error',
        message: 'New password must be different from current password.',
      });
      return;
    }

    const token = localStorage.getItem('user:token');
    if (!token) return;

    try {
      setSavingPassword(true);
      const res = await fetch(`${API_BASE_URL}/api/profile/password`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to change password.');
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setToast({
        type: 'success',
        message: 'Password changed successfully!',
      });
    } catch (err) {
      setToast({
        type: 'error',
        message: err.message || 'Failed to change password.',
      });
    } finally {
      setSavingPassword(false);
    }
  };

  // --------------------------------------------------
  // Save pinned conversations
  // --------------------------------------------------

  useEffect(() => {
    localStorage.setItem(
      'chatterflow-pinned-chats',
      JSON.stringify(pinnedConversations)
    );
  }, [pinnedConversations]);

  // --------------------------------------------------
  // Dark mode
  // --------------------------------------------------

  useEffect(() => {
    document.body.classList.toggle('dark', darkMode);

    localStorage.setItem(
      'chatterflow-theme',
      darkMode ? 'dark' : 'light'
    );
  }, [darkMode]);

  // --------------------------------------------------
  // Toast
  // --------------------------------------------------

  useEffect(() => {
    if (!toast) return undefined;

    const timeout = setTimeout(() => setToast(null), 3000);

    return () => clearTimeout(timeout);
  }, [toast]);

  // --------------------------------------------------
  // Socket Connection
  // --------------------------------------------------

  useEffect(() => {
    const token = localStorage.getItem('user:token') || '';
    if (!token) return undefined;

    const newSocket = io(SOCKET_URL, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      transports: ['websocket', 'polling'],
    });

    newSocket.on('connect', () => {
      if (user?.id) {
        newSocket.emit('addUser', user.id);
      }
    });

    newSocket.on('reconnect', () => {
      if (user?.id) {
        newSocket.emit('addUser', user.id);
      }
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [user?.id]);

  // --------------------------------------------------
  // Online Users Listener
  // --------------------------------------------------

  useEffect(() => {
    if (!socket) return undefined;

    const handleGetUsers = (connectedUsers) => {
      setOnlineUsers(connectedUsers || []);
    };

    socket.on('getUsers', handleGetUsers);

    return () => {
      socket.off('getUsers', handleGetUsers);
    };
  }, [socket]);

  // --------------------------------------------------
  // Check if a user is online
  // --------------------------------------------------

  const isUserOnline = useCallback(
    (userId) => {
      return onlineUsers.some(
        (u) => String(u.userId) === String(userId)
      );
    },
    [onlineUsers]
  );

  // --------------------------------------------------
  // Format last seen
  // --------------------------------------------------

  const formatLastSeen = useCallback(
    (receiverId, lastSeenDate) => {
      if (isUserOnline(receiverId)) return 'Online';

      if (!lastSeenDate) return 'Offline';

      const d = new Date(lastSeenDate);

      if (isNaN(d.getTime())) return 'Offline';

      const now = new Date();

      const diffMinutes = Math.floor(
        (now - d) / 60000
      );

      if (diffMinutes < 1) {
        return 'Active just now';
      }

      if (diffMinutes < 60) {
        return `Last seen ${diffMinutes}m ago`;
      }

      const diffHours = Math.floor(diffMinutes / 60);

      if (diffHours < 24) {
        return `Last seen ${diffHours}h ago`;
      }

      return `Last seen ${d.toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
      })}`;
    },
    [isUserOnline]
  );

  // --------------------------------------------------
  // Format message timestamp
  // --------------------------------------------------

  const formatMessageTime = (dateStr) => {
  if (!dateStr) return '';

  const d = new Date(dateStr);

  if (isNaN(d.getTime())) return '';

  return d.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

  // --------------------------------------------------
  // Position reaction/action picker
  // --------------------------------------------------

  const positionReactionPicker = (event, messageId) => {
    const chatViewport =
      event.currentTarget.closest('.chat-scrollable');

    if (!chatViewport) return;

    const messageBounds =
      event.currentTarget.getBoundingClientRect();

    const viewportBounds =
      chatViewport.getBoundingClientRect();

    /*
      The action bar contains several buttons and can be
      taller than the original 52px estimate.
    */
    const pickerHeight = 56;

    const roomAbove =
      messageBounds.top - viewportBounds.top;

    const roomBelow =
      viewportBounds.bottom - messageBounds.bottom;

    const nextPlacement =
      roomAbove < pickerHeight && roomBelow >= pickerHeight
        ? 'below'
        : 'above';

    setReactionPickerPlacement((prev) => {
      if (
        prev.messageId === messageId &&
        prev.placement === nextPlacement
      ) {
        return prev;
      }

      return {
        messageId,
        placement: nextPlacement,
      };
    });
  };

  // --------------------------------------------------
  // Socket Message Listeners
  // --------------------------------------------------

  useEffect(() => {
    if (!socket) return undefined;

    const handleIncomingMessage = (data) => {
      if (
        messages?.conversationId &&
        String(data.conversationId) ===
          String(messages.conversationId)
      ) {
        isPrependingRef.current = false;
        setMessages((prev) => {
          const exists = prev.messages.some(
            (m) =>
              m._id &&
              String(m._id) === String(data._id)
          );

          if (exists) return prev;

          return {
            ...prev,
            messages: [...prev.messages, data],
          };
        });

        if (
          String(data.senderId) !== String(user?.id)
        ) {
          fetch(`${API_BASE_URL}/api/message/read`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
              conversationId: messages.conversationId,
              readerId: user?.id,
            }),
          }).catch(() => {});

          socket.emit('markAsRead', {
            conversationId: messages.conversationId,
            readerId: user?.id,
            senderId: data.senderId,
          });
        }
      }

      setConversations((prev) => {
        return prev.map((conv) => {
          if (
            String(conv.conversationId) ===
            String(data.conversationId)
          ) {
            const isCurrentChat =
              String(messages?.conversationId) ===
              String(conv.conversationId);

            const lastMessageText =
              data.message && String(data.message).trim()
                ? data.message
                : Array.isArray(data.attachments) &&
                  data.attachments.length > 0
                ? data.attachments[0].type === 'image'
                  ? '📷 Photo'
                  : `📄 ${data.attachments[0].fileName || 'Document'}`
                : data.message || '';

            return {
              ...conv,
              lastMessage: {
                message: lastMessageText,
                createdAt: data.createdAt || new Date(),
                senderId: data.senderId,
                status: isCurrentChat
                  ? 'read'
                  : 'delivered',
              },
              unreadCount: isCurrentChat
                ? 0
                : (conv.unreadCount || 0) + 1,
            };
          }

          return conv;
        });
      });

      // --------------------------------------------------
      // Notifications & Sound Dispatch
      // --------------------------------------------------
      const isOwnMessage =
        String(data.senderId) === String(user?.id);
      const isEditOrDelete = Boolean(
        data.isDeleted || data.isEdited
      );
      const msgId = String(data._id || data.id || '');

      if (!isOwnMessage && !isEditOrDelete && msgId) {
        if (!notifiedMessageIdsRef.current.has(msgId)) {
          notifiedMessageIdsRef.current.add(msgId);
          if (notifiedMessageIdsRef.current.size > 100) {
            const oldestKey =
              notifiedMessageIdsRef.current.values().next().value;
            notifiedMessageIdsRef.current.delete(oldestKey);
          }

          const away = isUserAway(
            messages?.conversationId,
            data.conversationId
          );

          if (away) {
            if (soundEnabledRef.current) {
              playNotificationSound();
            }

            if (
              notificationsEnabledRef.current &&
              isNotificationSupported() &&
              getNotificationPermission() === 'granted'
            ) {
              showDesktopNotification(data, {
                onNotificationClick: (clickedData) => {
                  const currentConvs =
                    conversationsRef.current || [];
                  const foundConv = currentConvs.find(
                    (c) =>
                      String(c.conversationId) ===
                      String(clickedData.conversationId)
                  );
                  const convUser =
                    foundConv?.user || {
                      receiverId:
                        clickedData.user?.id ||
                        clickedData.senderId,
                      fullName:
                        clickedData.user?.fullName ||
                        clickedData.senderName ||
                        'User',
                      email:
                        clickedData.user?.email || '',
                    };

                  setShowPeoplePanel(false);
                  setShowMobileSidebar(false);

                  if (
                    typeof fetchMessagesRef.current ===
                    'function'
                  ) {
                    fetchMessagesRef.current(
                      clickedData.conversationId,
                      convUser
                    );
                  }
                },
              });
            }
          }
        }
      }
    };

    const handleMessageReacted = ({
      messageId,
      reactions,
    }) => {
      setMessages((prev) => ({
        ...prev,
        messages: prev.messages.map((m) =>
          String(m._id || m.id) === String(messageId)
            ? {
                ...m,
                reactions,
              }
            : m
        ),
      }));
    };

    const handleMessageEdited = ({
      messageId,
      message: newText,
    }) => {
      setMessages((prev) => ({
        ...prev,
        messages: prev.messages.map((m) =>
          String(m._id || m.id) === String(messageId)
            ? {
                ...m,
                message: newText,
                isEdited: true,
              }
            : m
        ),
      }));
    };

    const handleMessageDeleted = ({
      messageId,
    }) => {
      setMessages((prev) => ({
        ...prev,
        messages: prev.messages.map((m) =>
          String(m._id || m.id) === String(messageId)
            ? {
                ...m,
                message: 'This message was deleted',
                isDeleted: true,
              }
            : m
        ),
      }));
    };

    const handleMessagesRead = ({
      conversationId,
    }) => {
      if (
        String(messages?.conversationId) ===
        String(conversationId)
      ) {
        setMessages((prev) => ({
          ...prev,
          messages: prev.messages.map((m) => ({
            ...m,
            status: 'read',
          })),
        }));
      }
    };

    const handleUserTyping = ({
      senderId,
      conversationId,
      senderName,
    }) => {
      if (
        String(messages?.conversationId) ===
          String(conversationId) &&
        String(senderId) !== String(user?.id)
      ) {
        setTypingData({
          senderId,
          senderName,
        });
      }
    };

    const handleUserStoppedTyping = ({
      senderId,
      conversationId,
    }) => {
      if (
        String(messages?.conversationId) ===
          String(conversationId) &&
        String(senderId) !== String(user?.id)
      ) {
        setTypingData(null);
      }
    };

    const handleProfileUpdated = (payload) => {
      if (!payload?.userId) return;
      const { userId, fullName, avatar } = payload;
      const currentUserId = user?.id || user?._id;

      if (String(userId) === String(currentUserId)) {
        setUser((prev) => {
          const next = {
            ...prev,
            fullName: fullName || prev.fullName,
            avatar: avatar !== undefined ? avatar : prev.avatar,
          };
          localStorage.setItem('user:detail', JSON.stringify(next));
          return next;
        });
      }

      setConversations((prev) =>
        prev.map((c) =>
          String(c.user?.receiverId) === String(userId)
            ? {
                ...c,
                user: {
                  ...c.user,
                  fullName: fullName || c.user.fullName,
                  avatar: avatar !== undefined ? avatar : c.user.avatar,
                },
              }
            : c
        )
      );

      setMessages((prev) => {
        if (String(prev?.receiver?.receiverId) === String(userId)) {
          return {
            ...prev,
            receiver: {
              ...prev.receiver,
              fullName: fullName || prev.receiver.fullName,
              avatar: avatar !== undefined ? avatar : prev.receiver.avatar,
            },
          };
        }
        return prev;
      });

      setUsers((prev) =>
        prev.map((u) =>
          String(u.user?.receiverId) === String(userId)
            ? {
                ...u,
                user: {
                  ...u.user,
                  fullName: fullName || u.user.fullName,
                  avatar: avatar !== undefined ? avatar : u.user.avatar,
                },
              }
            : u
        )
      );
    };

    socket.on(
      'getMessage',
      handleIncomingMessage
    );

    socket.on(
      'profileUpdated',
      handleProfileUpdated
    );

    socket.on(
      'messageReacted',
      handleMessageReacted
    );

    socket.on(
      'messageEdited',
      handleMessageEdited
    );

    socket.on(
      'messageDeleted',
      handleMessageDeleted
    );

    socket.on(
      'messagesRead',
      handleMessagesRead
    );

    socket.on(
      'userTyping',
      handleUserTyping
    );

    socket.on(
      'userStoppedTyping',
      handleUserStoppedTyping
    );

    return () => {
      socket.off(
        'getMessage',
        handleIncomingMessage
      );

      socket.off(
        'profileUpdated',
        handleProfileUpdated
      );

      socket.off(
        'messageReacted',
        handleMessageReacted
      );

      socket.off(
        'messageEdited',
        handleMessageEdited
      );

      socket.off(
        'messageDeleted',
        handleMessageDeleted
      );

      socket.off(
        'messagesRead',
        handleMessagesRead
      );

      socket.off(
        'userTyping',
        handleUserTyping
      );

      socket.off(
        'userStoppedTyping',
        handleUserStoppedTyping
      );
    };
  }, [
    socket,
    messages?.conversationId,
    user?.id,
    user?._id,
  ]);

  // --------------------------------------------------
  // Fetch Conversations
  // --------------------------------------------------

  const fetchConversationsList =
    useCallback(async () => {
      if (!user?.id) return;

      try {
        setLoadingConversations(true);

        const res = await fetch(
          `${API_BASE_URL}/api/conversations/${user.id}`,
          {
            method: 'GET',
            headers: getAuthHeaders(),
          }
        );

        if (!res.ok) {
          throw new Error(
            'Failed to fetch conversations'
          );
        }

        const resData = await res.json();

        setConversations(resData);
      } catch (error) {
        setToast({
          type: 'error',
          message:
            'Unable to load conversations.',
        });
      } finally {
        setLoadingConversations(false);
      }
    }, [user?.id]);

  useEffect(() => {
    fetchConversationsList();
  }, [fetchConversationsList]);

  // --------------------------------------------------
  // Fetch People / Users
  // --------------------------------------------------

  useEffect(() => {
    const fetchUsers = async () => {
      if (!user?.id) return;

      try {
        setLoadingUsers(true);

        const res = await fetch(
          `${API_BASE_URL}/api/users/${user.id}`,
          {
            method: 'GET',
            headers: getAuthHeaders(),
          }
        );

        if (!res.ok) {
          throw new Error(
            'Failed to fetch users'
          );
        }

        const resData = await res.json();

        setUsers(resData);
      } catch (error) {
        setToast({
          type: 'error',
          message:
            'Unable to load people.',
        });
      } finally {
        setLoadingUsers(false);
      }
    };

    fetchUsers();
  }, [user?.id]);

  // --------------------------------------------------
  // Auto-scroll & Pagination Scroll Adjustment
  // --------------------------------------------------

  useLayoutEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    if (isPrependingRef.current && prevScrollSnapshotRef.current) {
      const { scrollHeight: prevHeight, scrollTop: prevTop } = prevScrollSnapshotRef.current;
      const heightDiff = container.scrollHeight - prevHeight;
      container.scrollTop = prevTop + heightDiff;
      isPrependingRef.current = false;
      prevScrollSnapshotRef.current = null;
    } else if (isInitialLoadRef.current && messages?.messages?.length > 0) {
      container.scrollTop = container.scrollHeight;
      isInitialLoadRef.current = false;
    }
  }, [messages?.messages]);

  useEffect(() => {
    if (isPrependingRef.current || isInitialLoadRef.current) return;
    const container = chatContainerRef.current;
    if (container) {
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 250;
      if (isNearBottom && messageRef.current) {
        messageRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'end',
        });
      }
    }
  }, [messages?.messages?.length, typingData]);

  // --------------------------------------------------
  // Pin / Unpin Conversation
  // --------------------------------------------------

  const togglePinConversation = (
    conversationId,
    e
  ) => {
    if (e) e.stopPropagation();

    setPinnedConversations((prev) =>
      prev.includes(conversationId)
        ? prev.filter(
            (id) => id !== conversationId
          )
        : [...prev, conversationId]
    );
  };

  // --------------------------------------------------
  // Filtered & Sorted Conversations
  // --------------------------------------------------

  const filteredConversations = useMemo(() => {
    const query =
      conversationSearch
        .trim()
        .toLowerCase();

    const filtered =
      conversations.filter(
        ({
          user: convUser,
          lastMessage,
        }) => {
          if (!query) return true;

          return (
            convUser?.fullName
              ?.toLowerCase()
              .includes(query) ||
            convUser?.email
              ?.toLowerCase()
              .includes(query) ||
            lastMessage?.message
              ?.toLowerCase()
              .includes(query)
          );
        }
      );

    return filtered.sort((a, b) => {
      const aPinned =
        pinnedConversations.includes(
          a.conversationId
        );

      const bPinned =
        pinnedConversations.includes(
          b.conversationId
        );

      if (aPinned && !bPinned) return -1;

      if (!aPinned && bPinned) return 1;

      const aDate =
        a.lastMessage?.createdAt
          ? new Date(
              a.lastMessage.createdAt
            )
          : 0;

      const bDate =
        b.lastMessage?.createdAt
          ? new Date(
              b.lastMessage.createdAt
            )
          : 0;

      return bDate - aDate;
    });
  }, [
    conversationSearch,
    conversations,
    pinnedConversations,
  ]);

  // --------------------------------------------------
  // Filtered Users
  // --------------------------------------------------

  const filteredUsers = useMemo(() => {
    const query =
      peopleSearch.trim().toLowerCase();

    return users.filter(
      ({ user: person }) => {
        if (!query) {
          return !conversations.some(
            (c) =>
              String(
                c.user?.receiverId
              ) ===
              String(
                person?.receiverId
              )
          );
        }

        const matches =
          person?.fullName
            ?.toLowerCase()
            .includes(query) ||
            person?.email
            ?.toLowerCase()
            .includes(query);

        return (
          matches &&
          !conversations.some(
            (c) =>
              String(
                c.user?.receiverId
              ) ===
              String(
                person?.receiverId
              )
          )
        );
      }
    );
  }, [
    conversations,
    peopleSearch,
    users,
  ]);

  // --------------------------------------------------
  // Fetch Messages (Initial Load with Pagination)
  // --------------------------------------------------

  const fetchMessages = async (
    conversationId,
    receiver
  ) => {
    if (!user?.id || !receiver) return;

    const recId = receiver.receiverId || receiver._id || receiver.id;
    const normalizedReceiver = {
      receiverId: recId,
      fullName: receiver.fullName || 'User',
      email: receiver.email || '',
      lastSeen: receiver.lastSeen || null,
    };

    try {
      setLoadingMessages(true);
      setReplyingTo(null);
      setEditingMessage(null);
      setTypingData(null);
      clearSelectedFile();
      setHasMoreMessages(true);
      setLoadingOlderMessages(false);
      loadingOlderRef.current = false;
      isInitialLoadRef.current = true;
      isPrependingRef.current = false;
      prevScrollSnapshotRef.current = null;

      const res = await fetch(
        `${API_BASE_URL}/api/message/${conversationId}?limit=30&senderId=${user.id}&receiverId=${recId}`,
        {
          method: 'GET',
          headers: getAuthHeaders(),
        }
      );

      if (!res.ok) {
        throw new Error(
          'Failed to fetch messages'
        );
      }

      const resData = await res.json();
      const rawMessages = Array.isArray(resData) ? resData : (resData.messages || []);
      const hasMore = Array.isArray(resData) ? false : Boolean(resData.hasMore);

      setMessages({
        messages: rawMessages,
        receiver: normalizedReceiver,
        conversationId,
      });
      setHasMoreMessages(hasMore);

      fetch(
        `${API_BASE_URL}/api/message/read`,
        {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            conversationId,
            readerId: user.id,
          }),
        }
      ).catch(() => {});

      socket?.emit('markAsRead', {
        conversationId,
        readerId: user.id,
        senderId: recId,
      });

      setConversations((prev) =>
        prev.map((c) =>
          String(c.conversationId) ===
          String(conversationId)
            ? {
                ...c,
                unreadCount: 0,
              }
            : c
        )
      );

      setShowMobileSidebar(false);
      setShowPeoplePanel(false);
    } catch (error) {
      setToast({
        type: 'error',
        message:
          'Unable to load this conversation.',
      });
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    fetchMessagesRef.current = fetchMessages;
  });

  // --------------------------------------------------
  // Load Older Messages (Infinite Scroll Up)
  // --------------------------------------------------

  const loadOlderMessages = async () => {
    if (
      loadingOlderRef.current ||
      !hasMoreMessages ||
      !messages?.conversationId ||
      messages.conversationId === 'new' ||
      !messages.messages.length
    ) {
      return;
    }

    const container = chatContainerRef.current;
    if (!container) return;

    const oldestMsg = messages.messages[0];
    if (!oldestMsg) return;

    const before = oldestMsg.createdAt;
    const beforeId = oldestMsg._id || oldestMsg.id;

    prevScrollSnapshotRef.current = {
      scrollHeight: container.scrollHeight,
      scrollTop: container.scrollTop,
    };
    loadingOlderRef.current = true;
    setLoadingOlderMessages(true);
    isPrependingRef.current = true;

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/message/${messages.conversationId}?limit=30&before=${encodeURIComponent(before)}&beforeId=${encodeURIComponent(beforeId)}`,
        {
          method: 'GET',
          headers: getAuthHeaders(),
        }
      );

      if (!res.ok) {
        throw new Error('Failed to fetch older messages');
      }

      const resData = await res.json();
      const fetchedMessages = Array.isArray(resData) ? resData : (resData.messages || []);
      const hasMore = Array.isArray(resData) ? false : Boolean(resData.hasMore);

      if (fetchedMessages.length > 0) {
        setMessages((prev) => {
          const existingIds = new Set(prev.messages.map((m) => String(m._id || m.id)));
          const uniqueNew = fetchedMessages.filter((m) => !existingIds.has(String(m._id || m.id)));
          return {
            ...prev,
            messages: [...uniqueNew, ...prev.messages],
          };
        });
      }

      setHasMoreMessages(hasMore);
    } catch (err) {
      console.error('Error loading older messages:', err);
      isPrependingRef.current = false;
      prevScrollSnapshotRef.current = null;
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlderMessages(false);
    }
  };

  const handleChatScroll = (e) => {
    const target = e.currentTarget;
    if (
      target.scrollTop <= 60 &&
      hasMoreMessages &&
      !loadingOlderRef.current &&
      !loadingMessages &&
      messages?.messages?.length > 0
    ) {
      loadOlderMessages();
    }
  };

  // --------------------------------------------------
  // Handle Typing Indicator
  // --------------------------------------------------

  const handleInputChange = (e) => {
    const val = e.target.value;

    setMessage(val);

    if (
      !socket ||
      !messages?.receiver ||
      !messages?.conversationId
    ) {
      return;
    }

    if (!isTypingRef.current) {
      isTypingRef.current = true;

      socket.emit('typing', {
        senderId: user.id,
        receiverId:
          messages.receiver.receiverId,
        conversationId:
          messages.conversationId,
        senderName:
          user.fullName || 'Someone',
      });
    }

    if (typingTimeoutRef.current) {
      clearTimeout(
        typingTimeoutRef.current
      );
    }

    typingTimeoutRef.current =
      setTimeout(() => {
        isTypingRef.current = false;

        socket.emit('stopTyping', {
          senderId: user.id,
          receiverId:
            messages.receiver.receiverId,
          conversationId:
            messages.conversationId,
        });
      }, 2000);
  };

  // --------------------------------------------------
  // Send Message
  // --------------------------------------------------

  const sendMessage = async (e) => {
    e.preventDefault();

    if (
      (!message.trim() && !selectedFile) ||
      !messages?.receiver ||
      !user?.id
    ) {
      return;
    }

    const trimmedMessage = message.trim();

    if (isTypingRef.current) {
      isTypingRef.current = false;

      socket?.emit('stopTyping', {
        senderId: user.id,
        receiverId: messages.receiver.receiverId,
        conversationId: messages.conversationId,
      });
    }

    // --------------------------------------------------
    // Edit Message
    // --------------------------------------------------

    if (editingMessage) {
      try {
        setSending(true);

        const res = await fetch(
          `${API_BASE_URL}/api/message/${editingMessage.id}`,
          {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({
              message: trimmedMessage,
              senderId: user.id,
            }),
          }
        );

        if (!res.ok) {
          throw new Error('Failed to edit message');
        }

        setMessages((prev) => ({
          ...prev,
          messages: prev.messages.map((m) =>
            String(m._id || m.id) === String(editingMessage.id)
              ? {
                  ...m,
                  message: trimmedMessage,
                  isEdited: true,
                }
              : m
          ),
        }));

        socket?.emit('editMessage', {
          messageId: editingMessage.id,
          conversationId: messages.conversationId,
          senderId: user.id,
          receiverId: messages.receiver.receiverId,
          message: trimmedMessage,
        });

        setEditingMessage(null);
        setMessage('');
      } catch (err) {
        setToast({
          type: 'error',
          message: 'Failed to update message.',
        });
      } finally {
        setSending(false);
      }

      return;
    }

    // --------------------------------------------------
    // Upload Attachment (if present)
    // --------------------------------------------------

    let uploadedAttachments = [];
    const currentSelectedFile = selectedFile;
    const currentFilePreview = filePreview;

    if (currentSelectedFile) {
      try {
        setSending(true);
        const formData = new FormData();
        formData.append('file', currentSelectedFile);
        formData.append('conversationId', messages.conversationId || 'new');
        if (messages.receiver?.receiverId) {
          formData.append('receiverId', messages.receiver.receiverId);
        }

        const token = localStorage.getItem('user:token');
        const uploadRes = await fetch(`${API_BASE_URL}/api/upload`, {
          method: 'POST',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: formData,
        });

        if (!uploadRes.ok) {
          const errData = await uploadRes.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to upload attachment.');
        }

        const attachmentData = await uploadRes.json();
        uploadedAttachments = [attachmentData];
      } catch (uploadErr) {
        setToast({
          type: 'error',
          message: uploadErr.message || 'Failed to upload attachment.',
        });
        setSending(false);
        return;
      }
    }

    // --------------------------------------------------
    // Optimistic Message
    // --------------------------------------------------

    const tempId = 'temp_' + Date.now();

    const optimisticAttachments = uploadedAttachments.length > 0
      ? uploadedAttachments
      : currentFilePreview
      ? [
          {
            type: currentFilePreview.type,
            url: currentFilePreview.url,
            fileName: currentFilePreview.name,
            mimeType: currentFilePreview.mimeType,
            size: currentFilePreview.size,
          },
        ]
      : [];

    const optimisticMessage = {
      _id: tempId,
      id: tempId,
      conversationId: messages.conversationId,
      senderId: user.id,
      message: trimmedMessage,
      attachments: optimisticAttachments,
      status: isUserOnline(messages.receiver.receiverId) ? 'delivered' : 'sent',
      replyTo: replyingTo || null,
      reactions: [],
      isEdited: false,
      isDeleted: false,
      createdAt: new Date().toISOString(),
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
      },
    };

    isPrependingRef.current = false;
    isInitialLoadRef.current = false;

    setMessages((prev) => ({
      ...prev,
      messages: [...prev.messages, optimisticMessage],
    }));

    setMessage('');
    clearSelectedFile();

    const currentReply = replyingTo;
    setReplyingTo(null);

    try {
      setSending(true);

      const res = await fetch(`${API_BASE_URL}/api/message`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          conversationId: messages.conversationId,
          senderId: user.id,
          message: trimmedMessage,
          attachments: uploadedAttachments,
          receiverId: messages.receiver.receiverId,
          replyTo: currentReply,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to send message');
      }

      const savedMessage = await res.json();

      setMessages((prev) => ({
        ...prev,
        conversationId: savedMessage.conversationId || prev.conversationId,
        messages: prev.messages.map((m) =>
          m._id === tempId ? savedMessage : m
        ),
      }));

      socket?.emit('sendMessage', {
        _id: savedMessage._id,
        senderId: user.id,
        receiverId: messages.receiver.receiverId,
        message: trimmedMessage,
        attachments: savedMessage.attachments || [],
        conversationId: savedMessage.conversationId || messages.conversationId,
        replyTo: currentReply,
        createdAt: savedMessage.createdAt,
      });

      fetchConversationsList();
    } catch (error) {
      setToast({
        type: 'error',
        message: 'Your message could not be sent.',
      });
    } finally {
      setSending(false);
    }
  };

  // --------------------------------------------------
  // Delete Message
  // --------------------------------------------------

  const handleDeleteMessage =
    async (messageId) => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/message/${messageId}`,
          {
            method: 'DELETE',
            headers: getAuthHeaders(),
            body: JSON.stringify({
              senderId: user.id,
            }),
          }
        );

        if (!res.ok) {
          throw new Error(
            'Failed to delete message'
          );
        }

        setMessages((prev) => ({
          ...prev,
          messages:
            prev.messages.map((m) =>
              String(
                m._id || m.id
              ) ===
              String(messageId)
                ? {
                    ...m,
                    message:
                      'This message was deleted',
                    isDeleted: true,
                  }
                : m
            ),
        }));

        socket?.emit(
          'deleteMessage',
          {
            messageId,
            conversationId:
              messages.conversationId,
            senderId: user.id,
            receiverId:
              messages?.receiver
                ?.receiverId,
          }
        );
      } catch (err) {
        setToast({
          type: 'error',
          message:
            'Could not delete message.',
        });
      }
    };

  // --------------------------------------------------
  // React to Message
  // --------------------------------------------------

  const handleReactMessage =
    async (
      messageId,
      emoji
    ) => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/message/react`,
          {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
              messageId,
              userId: user.id,
              emoji,
            }),
          }
        );

        if (!res.ok) {
          throw new Error(
            'Reaction failed'
          );
        }

        const data =
          await res.json();

        setMessages((prev) => ({
          ...prev,
          messages:
            prev.messages.map((m) =>
              String(
                m._id || m.id
              ) ===
              String(messageId)
                ? {
                    ...m,
                    reactions:
                      data.reactions,
                  }
                : m
            ),
        }));

        socket?.emit(
          'reactMessage',
          {
            messageId,
            conversationId:
              messages.conversationId,
            senderId: user.id,
            receiverId:
              messages?.receiver
                ?.receiverId,
            reactions:
              data.reactions,
          }
        );

        // Close picker after reacting
        setReactionPickerPlacement({
          messageId: null,
          placement: 'above',
        });
      } catch (err) {
        setToast({
          type: 'error',
          message:
            'Could not add reaction.',
        });
      }
    };

  // --------------------------------------------------
  // Start Edit
  // --------------------------------------------------

  const handleStartEdit = (
    msg
  ) => {
    setEditingMessage({
      id: msg._id || msg.id,
      message: msg.message,
    });

    setMessage(msg.message);

    setReplyingTo(null);

    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // --------------------------------------------------
  // Start Reply
  // --------------------------------------------------

  const handleStartReply = (
    msg,
    isCurrentUser
  ) => {
    let previewText = msg.message;
    if (!previewText && Array.isArray(msg.attachments) && msg.attachments.length > 0) {
      previewText =
        msg.attachments[0].type === 'image'
          ? '📷 Photo'
          : `📄 ${msg.attachments[0].fileName || 'Document'}`;
    }

    setReplyingTo({
      id: msg._id || msg.id,
      message: previewText || 'Attachment',
      senderName:
        isCurrentUser
          ? 'You'
          : msg.user?.fullName ||
            'User',
    });

    setEditingMessage(null);

    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // --------------------------------------------------
  // Logout
  // --------------------------------------------------

  const handleLogout = () => {
    localStorage.removeItem(
      'user:token'
    );

    localStorage.removeItem(
      'user:detail'
    );

    navigate('/users/sign_in');
  };

  const conversationCount =
    filteredConversations.length;

  const peopleCount =
    filteredUsers.length;

  // --------------------------------------------------
  // JSX
  // --------------------------------------------------

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 transition-colors duration-300 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-[1800px] p-2 sm:p-4 lg:p-5">
        <div className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/75 shadow-soft backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80">

          <div className="grid min-h-[calc(100vh-2rem)] grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)_320px]">

            {/* ==================================================
                LEFT SIDEBAR - CONVERSATIONS
            ================================================== */}

            <aside
              className={`${
                showMobileSidebar
                  ? 'fixed inset-0 z-40 flex lg:relative lg:flex'
                  : messages?.receiver?.fullName
                  ? 'hidden lg:flex'
                  : 'flex'
              }`}
            >
              <div className="flex w-full flex-col border-r border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/95 lg:border-r lg:bg-slate-50/80 lg:p-5">

                {/* User Header */}
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar
                      src={user?.avatar}
                      name={user?.fullName || 'My Profile'}
                      size="lg"
                      onlineIndicator={true}
                      isOnline={true}
                    />

                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold text-slate-800 dark:text-slate-100">
                        {user?.fullName ||
                          'My Profile'}
                      </h3>

                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {user?.email}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-shrink-0 items-center gap-1">
                    <button
                      type="button"
                      aria-label="Find people"
                      title="Find people"
                      onClick={() => setShowPeoplePanel(true)}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-violet-200 hover:text-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 lg:hidden"
                    >
                      <Users className="h-4 w-4" aria-hidden="true" />
                    </button>

                    <button
                      type="button"
                      aria-label="Notification settings"
                      title="Notification settings"
                      onClick={() => setShowSettingsModal(true)}
                      className="relative flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      {notificationsEnabled ? (
                        <Bell className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden="true" />
                      ) : (
                        <BellOff className="h-4 w-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                      )}
                      {notificationsEnabled && (
                        <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-violet-600 ring-2 ring-white dark:ring-slate-800" />
                      )}
                    </button>

                    <button
                      type="button"
                      aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                      title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                      onClick={() =>
                        setDarkMode(
                          (prev) => !prev
                        )
                      }
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      {darkMode ? (
                        <Sun className="h-4 w-4 text-amber-500" aria-hidden="true" />
                      ) : (
                        <Moon className="h-4 w-4 text-slate-700 dark:text-slate-200" aria-hidden="true" />
                      )}
                    </button>

                    <button
                      type="button"
                      aria-label="Log out"
                      title="Log out"
                      onClick={
                        handleLogout
                      }
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-red-500 shadow-sm transition hover:border-red-200 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-red-950/40"
                    >
                      <LogOut className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {/* Search Conversations */}
                <div className="mb-4">
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Search chats
                  </label>

                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                      <Search className="h-4 w-4" aria-hidden="true" />
                    </span>

                    <Input
                      name="conversation-search"
                      placeholder="Search conversations..."
                      className="pl-9 pr-3 text-xs"
                      value={
                        conversationSearch
                      }
                      onChange={(e) =>
                        setConversationSearch(
                          e.target.value
                        )
                      }
                    />
                  </div>
                </div>

                {/* Conversations Header */}
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-600 dark:text-violet-400">
                      Conversations
                    </h2>

                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-500/10 dark:text-violet-200">
                      {conversationCount}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowPeoplePanel(true)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 shadow-xs transition hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-violet-500/30 dark:bg-violet-950/50 dark:text-violet-300 lg:hidden"
                  >
                    <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>New Chat</span>
                  </button>
                </div>

                {/* Conversations List */}
                <div className="sidebar-scrollable min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                  {loadingConversations ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      Loading conversations…
                    </div>
                  ) : filteredConversations.length > 0 ? (
                    filteredConversations.map(
                      ({
                        conversationId,
                        user: conversationUser,
                        lastMessage,
                        unreadCount,
                      }) => {
                        const isSelected =
                          messages?.receiver
                            ?.receiverId ===
                          conversationUser?.receiverId;

                        const isOnline =
                          isUserOnline(
                            conversationUser?.receiverId
                          );

                        const isPinned =
                          pinnedConversations.includes(
                            conversationId
                          );

                        return (
                          <div
                            key={
                              conversationId
                            }
                            onClick={() =>
                              fetchMessages(
                                conversationId,
                                conversationUser
                              )
                            }
                            className={`group relative flex w-full cursor-pointer items-center gap-3 rounded-2xl border p-3 text-left transition duration-200 ${
                              isSelected
                                ? 'border-violet-300 bg-violet-100/70 shadow-sm dark:border-violet-500/30 dark:bg-violet-950/40'
                                : 'border-transparent bg-white hover:border-slate-200 hover:bg-slate-50 dark:bg-slate-800/80 dark:hover:bg-slate-800'
                            }`}
                          >
                            <Avatar
                              src={conversationUser?.avatar}
                              name={conversationUser?.fullName || 'Contact'}
                              size="lg"
                              onlineIndicator={true}
                              isOnline={isOnline}
                            />

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-1">
                                <div className="flex min-w-0 items-center gap-1.5">
                                  {isPinned && (
                                    <span className="flex-shrink-0" title="Pinned conversation">
                                      <Pin className="h-3 w-3 fill-amber-400 text-amber-500" aria-hidden="true" />
                                    </span>
                                  )}

                                  <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                                    {
                                      conversationUser?.fullName
                                    }
                                  </p>
                                </div>

                                <span className="flex-shrink-0 text-[10px] text-slate-400">
                                  {lastMessage?.createdAt
                                    ? formatMessageTime(
                                        lastMessage.createdAt
                                      )
                                    : ''}
                                </span>
                              </div>

                              <div className="mt-0.5 flex items-center justify-between gap-1">
                                <p className="min-w-0 truncate text-xs text-slate-500 dark:text-slate-400">
                                  {lastMessage ? (
                                    <>
                                      {String(
                                        lastMessage.senderId
                                      ) ===
                                        String(
                                          user?.id
                                        ) && (
                                        <span className="mr-1 font-medium text-slate-400">
                                          You:
                                        </span>
                                      )}

                                      {
                                        lastMessage.message
                                      }
                                    </>
                                  ) : (
                                    conversationUser?.email
                                  )}
                                </p>

                                {unreadCount >
                                  0 &&
                                  !isSelected && (
                                    <span className="flex h-4 min-w-[16px] flex-shrink-0 items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-bold text-white shadow-sm">
                                      {unreadCount}
                                    </span>
                                  )}
                              </div>
                            </div>

                            <button
                              type="button"
                              aria-label={isPinned ? 'Unpin chat' : 'Pin chat'}
                              title={
                                isPinned
                                  ? 'Unpin chat'
                                  : 'Pin chat'
                              }
                              onClick={(e) =>
                                togglePinConversation(
                                  conversationId,
                                  e
                                )
                              }
                              className="absolute right-2 top-2 hidden rounded-full p-1 text-slate-400 opacity-0 transition group-hover:block group-hover:opacity-100 hover:text-amber-500 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                            >
                              {isPinned ? (
                                <PinOff className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
                              ) : (
                                <Pin className="h-3.5 w-3.5" aria-hidden="true" />
                              )}
                            </button>
                          </div>
                        );
                      }
                    )
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                      No conversations yet.
                      Choose someone from
                      the People tab.
                    </div>
                  )}
                </div>
              </div>
            </aside>

            {/* ==================================================
                MAIN CHAT AREA
            ================================================== */}

            <main
              className={`flex min-h-[calc(100vh-2rem)] min-w-0 flex-col bg-gradient-to-b from-violet-50/70 to-white dark:from-slate-900 dark:to-slate-950 ${
                !messages?.receiver
                  ?.fullName &&
                !showMobileSidebar
                  ? 'hidden lg:flex'
                  : 'flex'
              }`}
            >
              {/* Chat Header */}
              <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/80 sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    type="button"
                    aria-label="Back to conversations"
                    title="Back to conversations"
                    className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:border-violet-200 hover:text-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 lg:hidden"
                    onClick={() => {
                      setMessages({
                        messages: [],
                        receiver: null,
                        conversationId:
                          null,
                      });

                      setShowMobileSidebar(
                        false
                      );
                    }}
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  </button>

                  {messages?.receiver
                    ?.fullName ? (
                    <>
                      <Avatar
                        src={messages.receiver?.avatar}
                        name={messages.receiver?.fullName || 'User'}
                        size="lg"
                        onlineIndicator={true}
                        isOnline={isUserOnline(messages.receiver?.receiverId)}
                      />

                      <div className="min-w-0">
                        <h3 className="truncate text-base font-semibold text-slate-800 dark:text-slate-100">
                          {
                            messages.receiver
                              .fullName
                          }
                        </h3>

                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {typingData &&
                          String(
                            typingData.senderId
                          ) ===
                            String(
                              messages
                                .receiver
                                .receiverId
                            ) ? (
                            <span className="font-medium text-violet-600 animate-pulse dark:text-violet-400">
                              typing...
                            </span>
                          ) : (
                            formatLastSeen(
                              messages
                                .receiver
                                .receiverId,
                              messages
                                .receiver
                                .lastSeen
                            )
                          )}
                        </p>
                      </div>
                    </>
                  ) : (
                    <div>
                      <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                        ChatterFlow
                      </h3>

                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Select a conversation
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex flex-shrink-0 items-center gap-2">
                  {messages?.conversationId && (
                    <button
                      type="button"
                      aria-label={pinnedConversations.includes(messages.conversationId) ? 'Unpin conversation' : 'Pin conversation'}
                      title={pinnedConversations.includes(messages.conversationId) ? 'Unpin conversation' : 'Pin conversation'}
                      onClick={(e) =>
                        togglePinConversation(
                          messages.conversationId,
                          e
                        )
                      }
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-violet-200 hover:text-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      {pinnedConversations.includes(
                        messages.conversationId
                      ) ? (
                        <PinOff className="h-4 w-4 text-amber-500" aria-hidden="true" />
                      ) : (
                        <Pin className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-violet-200 hover:text-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 lg:hidden"
                    aria-label="Open people panel"
                    title="Open people panel"
                    onClick={() =>
                      setShowPeoplePanel(
                        (prev) => !prev
                      )
                    }
                  >
                    <Users className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {/* ==================================================
                  MESSAGES BODY
              ================================================== */}

              {loadingMessages ? (
                <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                  Loading messages…
                </div>
              ) : messages?.receiver
                  ?.fullName ? (
                <>
                  <div
                    ref={chatContainerRef}
                    onScroll={handleChatScroll}
                    className="chat-scrollable min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6"
                  >
                    <div className="mx-auto w-full max-w-3xl space-y-4">
                      {/* Loading older messages indicator */}
                      {loadingOlderMessages && (
                        <div className="flex items-center justify-center py-2 animate-fade-in-up">
                          <div className="flex items-center gap-2 rounded-full border border-violet-200 bg-white/90 px-3.5 py-1 text-xs font-medium text-violet-700 shadow-xs dark:border-violet-500/30 dark:bg-slate-800 dark:text-violet-300">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-600 dark:text-violet-400" aria-hidden="true" />
                            <span>Loading older messages…</span>
                          </div>
                        </div>
                      )}

                      {/* Beginning of conversation notice */}
                      {!hasMoreMessages && messages.messages.length >= 30 && (
                        <div className="flex items-center justify-center py-2">
                          <span className="rounded-full bg-slate-200/60 px-3 py-1 text-[11px] font-medium tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                            Beginning of conversation
                          </span>
                        </div>
                      )}

                      {messages.messages
                        .length > 0 ? (
                        messages.messages.map(
                          (
                            msg,
                            index
                          ) => {
                            const isCurrentUser =
                              String(
                                msg.user?.id ||
                                  msg.senderId ||
                                  ''
                              ) ===
                              String(
                                user?.id ||
                                  ''
                              );

                            const isDeleted =
                              msg.isDeleted;

                            const isEdited =
                              msg.isEdited;

                            const messageId =
                              msg._id ||
                              msg.id ||
                              `msg-${index}`;

                            const reactions =
                              msg.reactions ||
                              [];

                            return (
                              <div
                                key={
                                  messageId
                                }
                                ref={
                                  index ===
                                  messages
                                    .messages
                                    .length -
                                    1
                                    ? messageRef
                                    : null
                                }
                                onMouseEnter={(
                                  event
                                ) =>
                                  positionReactionPicker(
                                    event,
                                    messageId
                                  )
                                }
                                className={`group relative flex max-w-full min-w-0 flex-col ${
                                  isCurrentUser
                                    ? 'items-end'
                                    : 'items-start'
                                } animate-fade-in-up`}
                              >
                                {/* Message Block + Action Bar */}
                                <div
                                  className={`relative flex max-w-full min-w-0 flex-col ${
                                    isCurrentUser ? 'items-end' : 'items-start'
                                  }`}
                                >
                                  {/* Action Bar */}
                                  {!isDeleted && (
                                    <div
                                      className={`absolute z-30 hidden max-w-[calc(100vw-2rem)] items-center gap-1 whitespace-nowrap rounded-2xl border border-slate-200 bg-white/95 px-2 py-1 shadow-lg group-hover:flex dark:border-slate-700 dark:bg-slate-800/95 before:absolute before:-inset-x-2 before:content-[''] ${
                                        reactionPickerPlacement.messageId ===
                                          messageId &&
                                        reactionPickerPlacement.placement ===
                                          'below'
                                          ? 'top-[calc(100%+6px)] before:-top-2.5 before:h-4'
                                          : 'bottom-[calc(100%+6px)] before:-bottom-2.5 before:h-4'
                                      } ${
                                        isCurrentUser
                                          ? 'right-0'
                                          : 'left-0'
                                      }`}
                                    >
                                      {/* Quick Emoji Reactions */}
                                      <div className="flex items-center gap-0.5 border-r border-slate-200 pr-1 dark:border-slate-700">
                                        {EMOJI_OPTIONS.slice(
                                          0,
                                          4
                                        ).map(
                                          (
                                            emoji
                                          ) => (
                                            <button
                                              key={
                                                emoji
                                              }
                                              type="button"
                                              onClick={() =>
                                                handleReactMessage(
                                                  messageId,
                                                  emoji
                                                )
                                              }
                                              className="rounded px-1 text-sm transition duration-150 hover:scale-125"
                                            >
                                              {
                                                emoji
                                              }
                                            </button>
                                          )
                                        )}
                                      </div>

                                      {/* Reply */}
                                      <button
                                        type="button"
                                        aria-label="Reply to message"
                                        title="Reply"
                                        onClick={() =>
                                          handleStartReply(
                                            msg,
                                            isCurrentUser
                                          )
                                        }
                                        className="rounded p-1 text-xs text-slate-500 transition hover:bg-slate-100 hover:text-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:text-slate-400 dark:hover:bg-slate-700"
                                      >
                                        <Reply className="h-3.5 w-3.5" aria-hidden="true" />
                                      </button>

                                      {/* Edit */}
                                      {isCurrentUser && (
                                        <button
                                          type="button"
                                          aria-label="Edit message"
                                          title="Edit message"
                                          onClick={() =>
                                            handleStartEdit(
                                              msg
                                            )
                                          }
                                          className="rounded p-1 text-xs text-slate-500 transition hover:bg-slate-100 hover:text-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:text-slate-400 dark:hover:bg-slate-700"
                                        >
                                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                        </button>
                                      )}

                                      {/* Delete */}
                                      {isCurrentUser && (
                                        <button
                                          type="button"
                                          aria-label="Delete message"
                                          title="Delete message"
                                          onClick={() =>
                                            handleDeleteMessage(
                                              messageId
                                            )
                                          }
                                          className="rounded p-1 text-xs text-slate-500 transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:text-slate-400 dark:hover:bg-red-950/40"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                        </button>
                                      )}
                                    </div>
                                  )}

                                  {/* Reply-to quote bubble */}
                                  {msg.replyTo &&
                                    !isDeleted && (
                                      <div
                                        className={`mb-1 max-w-[75%] rounded-xl border-l-4 border-violet-500 bg-slate-200/70 px-3 py-1.5 text-xs text-slate-700 dark:bg-slate-800/90 dark:text-slate-300 ${
                                          isCurrentUser
                                            ? 'text-right'
                                            : 'text-left'
                                        }`}
                                      >
                                        <span className="font-semibold text-violet-600 dark:text-violet-400">
                                          {
                                            msg
                                              .replyTo
                                              .senderName
                                          }
                                          :
                                        </span>{' '}

                                        <span className="break-words">
                                          {
                                            msg
                                              .replyTo
                                              .message
                                          }
                                        </span>
                                      </div>
                                    )}

                                  {/* Message Bubble */}
                                  <div
                                    className={`w-fit text-sm shadow-sm ${
                                      isDeleted
                                        ? 'min-w-0 max-w-full px-3 py-1'
                                        : 'min-w-[80px] max-w-[80%] px-4 py-2.5 sm:max-w-[75%]'
                                    } ${
                                      isCurrentUser
                                        ? isDeleted
                                          ? 'rounded-2xl rounded-br-md border border-slate-300 bg-slate-100 text-slate-400 italic dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500'
                                          : 'rounded-2xl rounded-br-md bg-gradient-to-r from-violet-600 to-indigo-600 text-white'
                                        : isDeleted
                                        ? 'rounded-2xl rounded-bl-md border border-slate-200 bg-slate-50 text-slate-400 italic dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500'
                                        : 'rounded-2xl rounded-bl-md bg-white text-slate-800 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700'
                                    }`}
                                  >
                                    {isDeleted ? (
                                      <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
                                        <Ban
                                          className="h-3.5 w-3.5 flex-shrink-0 text-slate-400 dark:text-slate-500"
                                          aria-hidden="true"
                                        />
                                        <span className="min-w-0 italic leading-none text-slate-400 dark:text-slate-500">
                                          {isCurrentUser
                                            ? 'You deleted this message'
                                            : 'This message was deleted'}
                                        </span>
                                        <span className="flex-shrink-0 text-[10px] leading-none text-slate-400 dark:text-slate-500">
                                          {formatMessageTime(msg.createdAt)}
                                        </span>
                                      </div>
                                    ) : (
                                      <>
                                        {/* Attachments */}
                                        {Array.isArray(msg.attachments) &&
                                          msg.attachments.length > 0 && (
                                            <div className="mb-1.5 space-y-1.5">
                                              {msg.attachments.map(
                                                (att, attIdx) => {
                                                  const isImg =
                                                    att.type === 'image' ||
                                                    att.mimeType?.startsWith(
                                                      'image/'
                                                    );
                                                  const mediaUrl =
                                                    resolveMediaUrl(
                                                      att.url
                                                    );

                                                  if (isImg) {
                                                    return (
                                                      <div
                                                        key={attIdx}
                                                        className="relative overflow-hidden rounded-xl bg-black/5 dark:bg-black/20"
                                                      >
                                                        <img
                                                          src={mediaUrl}
                                                          alt={
                                                            att.fileName ||
                                                            'Attached image'
                                                          }
                                                          loading="lazy"
                                                          onClick={() =>
                                                            setLightboxImage({
                                                              url: mediaUrl,
                                                              name:
                                                                att.fileName ||
                                                                'Image',
                                                            })
                                                          }
                                                          className="max-h-72 w-full max-w-sm cursor-pointer rounded-xl object-cover transition duration-200 hover:opacity-90 active:scale-[0.99]"
                                                        />
                                                      </div>
                                                    );
                                                  }

                                                  return (
                                                    <a
                                                      key={attIdx}
                                                      href={mediaUrl}
                                                      download={
                                                        att.fileName ||
                                                        'download'
                                                      }
                                                      target="_blank"
                                                      rel="noopener noreferrer"
                                                      className={`flex items-center gap-3 rounded-xl p-2.5 transition ${
                                                        isCurrentUser
                                                          ? 'bg-white/15 text-white hover:bg-white/25'
                                                          : 'bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-700/60 dark:text-slate-100 dark:hover:bg-slate-700'
                                                      }`}
                                                    >
                                                      <div
                                                        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${
                                                          isCurrentUser
                                                            ? 'bg-white/20 text-white'
                                                            : 'bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400'
                                                        }`}
                                                      >
                                                        {att.mimeType?.includes(
                                                          'pdf'
                                                        ) ? (
                                                          <FileText
                                                            className="h-5 w-5"
                                                            aria-hidden="true"
                                                          />
                                                        ) : att.mimeType?.includes(
                                                            'sheet'
                                                          ) ||
                                                          att.mimeType?.includes(
                                                            'csv'
                                                          ) ? (
                                                          <FileSpreadsheet
                                                            className="h-5 w-5"
                                                            aria-hidden="true"
                                                          />
                                                        ) : att.mimeType?.includes(
                                                            'zip'
                                                          ) ? (
                                                          <FileArchive
                                                            className="h-5 w-5"
                                                            aria-hidden="true"
                                                          />
                                                        ) : (
                                                          <File
                                                            className="h-5 w-5"
                                                            aria-hidden="true"
                                                          />
                                                        )}
                                                      </div>
                                                      <div className="min-w-0 flex-1">
                                                        <p
                                                          className="truncate text-xs font-semibold"
                                                          title={att.fileName}
                                                        >
                                                          {att.fileName ||
                                                            'Document'}
                                                        </p>
                                                        <p
                                                          className={`text-[11px] ${
                                                            isCurrentUser
                                                              ? 'text-violet-100'
                                                              : 'text-slate-500 dark:text-slate-400'
                                                          }`}
                                                        >
                                                          {formatFileSize(
                                                            att.size
                                                          )}
                                                        </p>
                                                      </div>
                                                      <Download
                                                        className="h-4 w-4 flex-shrink-0 opacity-80"
                                                        aria-hidden="true"
                                                      />
                                                    </a>
                                                  );
                                                }
                                              )}
                                            </div>
                                          )}

                                        {Boolean(
                                          msg.message && msg.message.trim()
                                        ) && (
                                          <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed">
                                            {msg.message}
                                          </p>
                                        )}

                                        {/* Footer */}
                                        <div
                                          className={`mt-1 flex items-center justify-end gap-1.5 whitespace-nowrap text-[10px] ${
                                            isCurrentUser
                                              ? 'text-violet-200'
                                              : 'text-slate-400 dark:text-slate-500'
                                          }`}
                                        >
                                          {isEdited && (
                                            <span className="italic">
                                              (edited)
                                            </span>
                                          )}

                                          <span>
                                            {formatMessageTime(
                                              msg.createdAt
                                            )}
                                          </span>

                                          {/* Status Ticks */}
                                          {isCurrentUser && (
                                            <span className="ml-0.5 inline-flex items-center">
                                              {msg.status ===
                                              'read' ? (
                                                <span
                                                  className="text-sky-300"
                                                  title="Read"
                                                >
                                                  <CheckCheck
                                                    className="h-3.5 w-3.5"
                                                    aria-hidden="true"
                                                  />
                                                </span>
                                              ) : msg.status ===
                                                'delivered' ? (
                                                <span
                                                  className="text-violet-200"
                                                  title="Delivered"
                                                >
                                                  <CheckCheck
                                                    className="h-3.5 w-3.5"
                                                    aria-hidden="true"
                                                  />
                                                </span>
                                              ) : (
                                                <span
                                                  className="text-violet-300"
                                                  title="Sent"
                                                >
                                                  <Check
                                                    className="h-3.5 w-3.5"
                                                    aria-hidden="true"
                                                  />
                                                </span>
                                              )}
                                            </span>
                                          )}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>

                                {/* Reaction badges */}
                                {reactions.length >
                                  0 && (
                                  <div
                                    className={`mt-1 flex max-w-[80%] flex-wrap gap-1 sm:max-w-[75%] ${
                                      isCurrentUser
                                        ? 'justify-end'
                                        : 'justify-start'
                                    }`}
                                  >
                                    {reactions.map(
                                      (
                                        r,
                                        i
                                      ) => (
                                        <button
                                          key={
                                            i
                                          }
                                          type="button"
                                          onClick={() =>
                                            handleReactMessage(
                                              messageId,
                                              r.emoji
                                            )
                                          }
                                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs shadow-xs transition hover:scale-105 ${
                                            String(
                                              r.userId
                                            ) ===
                                            String(
                                              user?.id
                                            )
                                              ? 'border-violet-300 bg-violet-100 text-violet-800 dark:border-violet-700 dark:bg-violet-900/40 dark:text-violet-200'
                                              : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                                          }`}
                                        >
                                          <span>
                                            {
                                              r.emoji
                                            }
                                          </span>
                                        </button>
                                      )
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          }
                        )
                      ) : (
                        <div className="flex min-h-[260px] items-center justify-center rounded-[28px] border border-dashed border-slate-200 bg-white/50 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
                          No messages yet.
                          Send a message
                          below to start
                          the conversation.
                        </div>
                      )}

                      {/* Typing indicator */}
                      {typingData &&
                        String(
                          typingData.senderId
                        ) ===
                          String(
                            messages.receiver
                              .receiverId
                          ) && (
                          <div className="flex items-center gap-2 text-xs text-slate-400 animate-pulse">
                            <div className="flex h-8 w-12 items-center justify-center rounded-2xl bg-white px-3 shadow-xs ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
                              <span className="flex gap-1">
                                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-600" />
                                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-600 delay-100" />
                                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-600 delay-200" />
                              </span>
                            </div>

                            <span>
                              {typingData.senderName ||
                                'Contact'}{' '}
                              is typing...
                            </span>
                          </div>
                        )}
                    </div>
                  </div>

                  {/* ==================================================
                      MESSAGE INPUT FOOTER
                  ================================================== */}

                  <div className="flex-shrink-0 border-t border-slate-200 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-900/80 sm:px-6 sm:py-4">

                    {/* Replying banner */}
                    {replyingTo && (
                      <div className="mx-auto mb-2 flex max-w-3xl items-center justify-between rounded-xl border-l-4 border-violet-600 bg-violet-50 px-3 py-2 text-xs text-slate-700 dark:bg-violet-950/40 dark:text-slate-200">
                        <div className="min-w-0 truncate">
                          Replying to{' '}
                          <strong className="text-violet-600 dark:text-violet-400">
                            {
                              replyingTo.senderName
                            }
                          </strong>
                          :{' '}
                          <span className="text-slate-500 dark:text-slate-400">
                            {
                              replyingTo.message
                            }
                          </span>
                        </div>

                        <button
                          type="button"
                          aria-label="Cancel reply"
                          title="Cancel reply"
                          onClick={() =>
                            setReplyingTo(
                              null
                            )
                          }
                          className="ml-2 flex-shrink-0 rounded p-0.5 text-slate-400 transition hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:hover:text-slate-200"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    )}

                    {/* Editing banner */}
                    {editingMessage && (
                      <div className="mx-auto mb-2 flex max-w-3xl items-center justify-between rounded-xl border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                        <div className="min-w-0 truncate">
                          Editing your
                          message:{' '}
                          <span className="italic">
                            {
                              editingMessage.message
                            }
                          </span>
                        </div>

                        <button
                          type="button"
                          aria-label="Cancel editing"
                          onClick={() => {
                            setEditingMessage(
                              null
                            );
                            setMessage('');
                          }}
                          className="ml-2 flex-shrink-0 text-amber-600 transition hover:text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:text-amber-400"
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    {/* Attachment Preview Tray */}
                    {filePreview && (
                      <div className="mx-auto mb-3 flex max-w-3xl items-center justify-between gap-3 rounded-2xl border border-violet-200 bg-violet-50/90 p-2.5 shadow-sm backdrop-blur dark:border-violet-800/50 dark:bg-violet-950/50">
                        <div className="flex min-w-0 items-center gap-3">
                          {filePreview.type === 'image' ? (
                            <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl border border-violet-300 dark:border-violet-700">
                              <img
                                src={filePreview.url}
                                alt="Attachment preview"
                                className="h-full w-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-violet-200 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300">
                              {filePreview.mimeType?.includes('pdf') ? (
                                <FileText className="h-6 w-6" aria-hidden="true" />
                              ) : filePreview.mimeType?.includes('sheet') ||
                                filePreview.mimeType?.includes('csv') ? (
                                <FileSpreadsheet className="h-6 w-6" aria-hidden="true" />
                              ) : filePreview.mimeType?.includes('zip') ? (
                                <FileArchive className="h-6 w-6" aria-hidden="true" />
                              ) : (
                                <File className="h-6 w-6" aria-hidden="true" />
                              )}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                              {filePreview.name}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              {formatFileSize(filePreview.size)}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={clearSelectedFile}
                          disabled={sending}
                          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-200/80 text-slate-600 transition hover:bg-slate-300 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                          aria-label="Remove attachment"
                          title="Remove attachment"
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    )}

                    {/* Input */}
                    <form
                      onSubmit={sendMessage}
                      className="mx-auto flex w-full max-w-3xl items-center gap-2 sm:gap-3"
                    >
                      {/* Hidden File Input */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        onChange={handleFileSelect}
                        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv,application/zip,application/x-zip-compressed"
                      />

                      {/* Attachment Trigger Button */}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={sending || Boolean(editingMessage)}
                        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600 shadow-sm transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-violet-500/40 dark:hover:bg-slate-700/80 dark:hover:text-violet-300"
                        aria-label="Attach file or image"
                        title="Attach file or image"
                      >
                        <Paperclip className="h-5 w-5" aria-hidden="true" />
                      </button>

                      <div className="relative min-w-0 flex-1">
                        <input
                          ref={inputRef}
                          name="message"
                          placeholder={
                            editingMessage
                              ? 'Edit your message...'
                              : replyingTo
                              ? 'Type your reply...'
                              : filePreview
                              ? 'Add a caption (optional)...'
                              : 'Type your message…'
                          }
                          value={message}
                          onChange={handleInputChange}
                          className="block w-full rounded-full border border-slate-200 bg-slate-50 px-5 py-3 text-sm text-slate-800 shadow-inner transition focus:border-violet-500 focus:outline-none focus:ring-4 focus:ring-violet-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-violet-500/20"
                          autoComplete="off"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={
                          (!message.trim() && !selectedFile) ||
                          sending
                        }
                        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/20 transition hover:-translate-y-[1px] hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label="Send message"
                        title="Send message"
                      >
                        {sending ? (
                          <Loader2 className="h-4 w-4 animate-spin text-white" aria-hidden="true" />
                        ) : (
                          <SendHorizontal className="h-4 w-4 text-white" aria-hidden="true" />
                        )}
                      </button>
                    </form>
                  </div>
                </>
              ) : (
                /* Empty Chat State */
                <div className="flex min-h-0 flex-1 items-center justify-center p-8">
                  <div className="max-w-md rounded-[28px] border border-dashed border-violet-200 bg-white/80 p-8 text-center shadow-sm dark:border-violet-500/20 dark:bg-slate-900/80">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-500/10">
                      <MessageSquare className="h-8 w-8 text-violet-600 dark:text-violet-400" aria-hidden="true" />
                    </div>

                    <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
                      Your inbox is ready
                    </h3>

                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                      Choose a conversation
                      from the sidebar or
                      start a new chat with
                      anyone from the people
                      list.
                    </p>
                  </div>
                </div>
              )}
            </main>

            {/* ==================================================
                RIGHT SIDEBAR - PEOPLE
            ================================================== */}

            {/* Mobile Backdrop */}
            {showPeoplePanel && (
              <div
                className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs transition-opacity lg:hidden"
                onClick={() => setShowPeoplePanel(false)}
                aria-hidden="true"
              />
            )}

            <aside
              className={`${
                showPeoplePanel
                  ? 'fixed inset-y-0 right-0 z-50 flex w-full max-w-sm shadow-2xl transition-transform lg:relative lg:z-auto lg:flex lg:shadow-none'
                  : 'hidden lg:flex'
              }`}
            >
              <div className="flex w-full flex-col border-l border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/95 lg:border-l lg:bg-slate-50/80 lg:p-5">

                {/* People Header */}
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-600 dark:text-violet-400">
                    People
                  </h2>

                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-500/10 dark:text-violet-200">
                      {peopleCount}
                    </span>

                    <button
                      type="button"
                      aria-label="Close people panel"
                      title="Close people panel"
                      onClick={() =>
                        setShowPeoplePanel(
                          false
                        )
                      }
                      className="rounded-lg p-1 text-slate-400 transition hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 lg:hidden dark:hover:text-slate-200"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {/* People Search */}
                <div className="mb-4">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                      <Search className="h-4 w-4" aria-hidden="true" />
                    </span>

                    <Input
                      name="people-search"
                      placeholder="Search users..."
                      className="pl-9 pr-3 text-xs"
                      value={
                        peopleSearch
                      }
                      onChange={(e) =>
                        setPeopleSearch(
                          e.target.value
                        )
                      }
                    />
                  </div>
                </div>

                {/* People List */}
                <div className="sidebar-scrollable min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                  {loadingUsers ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      Loading people…
                    </div>
                  ) : filteredUsers.length >
                    0 ? (
                    filteredUsers.map(
                      ({
                        user: person,
                      }) => {
                        const isOnline =
                          isUserOnline(
                            person?.receiverId
                          );

                        return (
                          <button
                            key={
                              person?.receiverId ||
                              person?.email
                            }
                            type="button"
                            onClick={() =>
                              fetchMessages(
                                'new',
                                person
                              )
                            }
                            className="flex w-full items-center gap-3 rounded-2xl border border-transparent bg-white p-3 text-left transition hover:border-violet-200 hover:bg-violet-50 dark:bg-slate-800/80 dark:hover:border-violet-500/20 dark:hover:bg-violet-500/5"
                          >
                            <Avatar
                              src={person?.avatar}
                              name={person?.fullName || 'User'}
                              size="lg"
                              onlineIndicator={true}
                              isOnline={isOnline}
                            />

                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                                {
                                  person?.fullName
                                }
                              </p>

                              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                {isOnline ? (
                                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                    Online
                                  </span>
                                ) : (
                                  person?.email
                                )}
                              </p>
                            </div>
                          </button>
                        );
                      }
                    )
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                      No new people
                      found
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>

      {/* ==================================================
          IMAGE LIGHTBOX MODAL
      ================================================== */}

      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md transition-all animate-fade-in"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="relative flex max-h-[90vh] max-w-[90vw] flex-col overflow-hidden rounded-2xl bg-slate-950 shadow-2xl ring-1 ring-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Bar */}
            <div className="flex items-center justify-between border-b border-white/10 bg-slate-900/80 px-4 py-3 text-white backdrop-blur">
              <span className="truncate pr-4 text-xs sm:text-sm font-medium">
                {lightboxImage.name}
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={lightboxImage.url}
                  download={lightboxImage.name}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                  aria-label="Download image"
                  title="Download image"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                </a>
                <button
                  type="button"
                  onClick={() => setLightboxImage(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                  aria-label="Close image viewer"
                  title="Close image viewer"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Image Preview */}
            <div className="flex min-h-0 flex-1 items-center justify-center p-2">
              <img
                src={lightboxImage.url}
                alt={lightboxImage.name}
                className="max-h-[80vh] max-w-[85vw] rounded-lg object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* ==================================================
          SETTINGS & PROFILE MODAL
      ================================================== */}

      {showSettingsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-sm transition-all animate-fade-in"
          onClick={() => {
            setShowSettingsModal(false);
            handleCancelAvatarPreview();
          }}
        >
          <div
            className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl backdrop-blur-xl transition-all dark:border-slate-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-modal-title"
          >
            {/* Modal Header */}
            <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-100 p-5 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-violet-100 text-violet-600 dark:bg-violet-950/60 dark:text-violet-400">
                  <Settings className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h2
                    id="settings-modal-title"
                    className="text-base font-bold text-slate-800 dark:text-slate-100"
                  >
                    Notification Settings
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Manage profile, notifications, and account security
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowSettingsModal(false);
                  handleCancelAvatarPreview();
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label="Close settings"
                title="Close settings"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex flex-shrink-0 border-b border-slate-100 px-5 pt-2 dark:border-slate-800 overflow-x-auto scrollbar-none">
              <div className="flex space-x-1 sm:space-x-2">
                {[
                  { id: 'profile', label: 'Profile', icon: User },
                  { id: 'notifications', label: 'Notifications', icon: Bell },
                  { id: 'appearance', label: 'Appearance', icon: Palette },
                  { id: 'security', label: 'Security', icon: Shield },
                  { id: 'account', label: 'Account', icon: CheckCircle2 },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSettingsTab(id)}
                    aria-label={`${label} settings tab`}
                    className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-semibold transition ${
                      settingsTab === id
                        ? 'border-violet-600 text-violet-600 dark:border-violet-400 dark:text-violet-400'
                        : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Modal Body / Tab Content */}
            <div className="flex-1 overflow-y-auto p-5 sidebar-scrollable">
              {/* TAB 1: PROFILE */}
              {settingsTab === 'profile' && (
                <div className="space-y-6">
                  {/* Avatar Section */}
                  <div className="flex flex-col items-center sm:flex-row sm:items-start gap-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800/80 dark:bg-slate-800/40">
                    <div className="relative flex-shrink-0">
                      <Avatar
                        src={avatarPreview || user?.avatar}
                        name={user?.fullName || 'My Profile'}
                        size="2xl"
                      />
                    </div>

                    <div className="flex-1 text-center sm:text-left min-w-0">
                      <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        Profile Photo
                      </h4>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        Upload a JPG, PNG, WebP, or GIF (max. 5 MB).
                      </p>

                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        onChange={handleAvatarSelect}
                        className="hidden"
                      />

                      {avatarPreview ? (
                        <div className="mt-3 flex flex-wrap items-center justify-center sm:justify-start gap-2">
                          <button
                            type="button"
                            onClick={handleUploadAvatar}
                            disabled={uploadingAvatar}
                            aria-label="Upload photo"
                            className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-violet-700 disabled:opacity-50"
                          >
                            {uploadingAvatar ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Upload className="h-3.5 w-3.5" />
                            )}
                            <span>{uploadingAvatar ? 'Uploading…' : 'Upload Photo'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={handleCancelAvatarPreview}
                            disabled={uploadingAvatar}
                            aria-label="Cancel avatar selection"
                            className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-600 shadow-xs transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="mt-3 flex flex-wrap items-center justify-center sm:justify-start gap-2">
                          <button
                            type="button"
                            onClick={() => avatarInputRef.current?.click()}
                            aria-label="Change photo"
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            <Camera className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                            <span>Change Photo</span>
                          </button>

                          {user?.avatar?.url && (
                            <button
                              type="button"
                              onClick={handleRemoveAvatar}
                              disabled={removingAvatar}
                              aria-label="Remove photo"
                              className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50/50 px-3.5 py-1.5 text-xs font-semibold text-red-600 shadow-xs transition hover:bg-red-100 dark:border-red-500/30 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60"
                            >
                              {removingAvatar ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                              <span>{removingAvatar ? 'Removing…' : 'Remove'}</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Display Name Section */}
                  <form onSubmit={handleSaveDisplayName} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800/80 dark:bg-slate-800/40">
                    <label
                      htmlFor="settings-display-name"
                      className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300"
                    >
                      Display Name
                    </label>

                    <div className="mt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <input
                        id="settings-display-name"
                        type="text"
                        name="displayName"
                        value={displayNameInput}
                        onChange={(e) => setDisplayNameInput(e.target.value)}
                        placeholder="Display name"
                        maxLength={50}
                        className="flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-800 shadow-xs outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-violet-400"
                      />

                      <button
                        type="submit"
                        disabled={savingProfile || !displayNameInput.trim()}
                        aria-label="Save profile changes"
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-violet-700 disabled:opacity-50"
                      >
                        {savingProfile ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        <span>{savingProfile ? 'Saving…' : 'Save Changes'}</span>
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* TAB 2: NOTIFICATIONS */}
              {settingsTab === 'notifications' && (
                <div className="space-y-4">
                  {/* Desktop Notifications Item */}
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 transition dark:border-slate-800/80 dark:bg-slate-800/40">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex gap-3">
                        <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-950/60 dark:text-violet-400">
                          {notificationsEnabled ? (
                            <Bell className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <BellOff className="h-4 w-4" aria-hidden="true" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                              Desktop notifications
                            </h3>
                            {notificationPermission === 'denied' ? (
                              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-950/50 dark:text-red-300">
                                Blocked
                              </span>
                            ) : notificationsEnabled ? (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                                ON
                              </span>
                            ) : (
                              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                OFF
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            Notifications are shown when you're away from a conversation.
                          </p>
                          {notificationPermission === 'denied' && (
                            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                              Permission is blocked by your browser. Please allow notifications in site settings.
                            </p>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleToggleNotifications}
                        aria-label={
                          notificationsEnabled
                            ? 'Disable desktop notifications'
                            : 'Enable desktop notifications'
                        }
                        title={
                          notificationsEnabled
                            ? 'Disable desktop notifications'
                            : 'Enable desktop notifications'
                        }
                        className={`flex-shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-semibold shadow-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                          notificationsEnabled
                            ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                            : 'bg-violet-600 text-white hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500'
                        }`}
                      >
                        {notificationsEnabled ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  </div>

                  {/* Message Sound Item */}
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 transition dark:border-slate-800/80 dark:bg-slate-800/40">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex gap-3">
                        <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-950/60 dark:text-violet-400">
                          {soundEnabled ? (
                            <Volume2 className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <VolumeX className="h-4 w-4" aria-hidden="true" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                              Message sound
                            </h3>
                            {soundEnabled ? (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                                ON
                              </span>
                            ) : (
                              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                OFF
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            Play a sound for new messages.
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={handleTestSound}
                          aria-label="Test message sound"
                          title="Test message sound"
                          className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-xs transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                        >
                          Test
                        </button>

                        <button
                          type="button"
                          onClick={handleToggleSound}
                          aria-label={
                            soundEnabled
                              ? 'Disable message sound'
                              : 'Enable message sound'
                          }
                          title={
                            soundEnabled
                              ? 'Disable message sound'
                              : 'Enable message sound'
                          }
                          className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold shadow-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                            soundEnabled
                              ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                              : 'bg-violet-600 text-white hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500'
                          }`}
                        >
                          {soundEnabled ? 'Off' : 'On'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: APPEARANCE */}
              {settingsTab === 'appearance' && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800/80 dark:bg-slate-800/40">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      Theme Mode
                    </h3>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Choose between light and dark themes for ChatterFlow.
                    </p>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setDarkMode(false);
                          localStorage.setItem('chatterflow-theme', 'light');
                          document.documentElement.classList.remove('dark');
                        }}
                        aria-label="Select light theme"
                        className={`flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition ${
                          !darkMode
                            ? 'border-violet-500 bg-white ring-2 ring-violet-500/20 dark:bg-slate-800'
                            : 'border-slate-200 bg-white/60 hover:bg-white dark:border-slate-700 dark:bg-slate-800/60'
                        }`}
                      >
                        <Sun className="h-6 w-6 text-amber-500" />
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Light Mode</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setDarkMode(true);
                          localStorage.setItem('chatterflow-theme', 'dark');
                          document.documentElement.classList.add('dark');
                        }}
                        aria-label="Select dark theme"
                        className={`flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition ${
                          darkMode
                            ? 'border-violet-500 bg-white ring-2 ring-violet-500/20 dark:bg-slate-800'
                            : 'border-slate-200 bg-white/60 hover:bg-white dark:border-slate-700 dark:bg-slate-800/60'
                        }`}
                      >
                        <Moon className="h-6 w-6 text-violet-400" />
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Dark Mode</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: SECURITY */}
              {settingsTab === 'security' && (
                <form onSubmit={handleChangePassword} className="space-y-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800/80 dark:bg-slate-800/40">
                  <div className="flex items-center gap-2 border-b border-slate-200/60 pb-3 dark:border-slate-700/60">
                    <Lock className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      Change Password
                    </h3>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                      Current Password
                    </label>
                    <input
                      type="password"
                      name="currentPassword"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      required
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-800 shadow-xs outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                      New Password
                    </label>
                    <input
                      type="password"
                      name="newPassword"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password (min. 6 characters)"
                      minLength={6}
                      required
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-800 shadow-xs outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      name="confirmPassword"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      minLength={6}
                      required
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-800 shadow-xs outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={savingPassword}
                      aria-label="Change password"
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-violet-700 disabled:opacity-50"
                    >
                      {savingPassword ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <KeyRound className="h-3.5 w-3.5" />
                      )}
                      <span>{savingPassword ? 'Changing Password…' : 'Change Password'}</span>
                    </button>
                  </div>
                </form>
              )}

              {/* TAB 5: ACCOUNT */}
              {settingsTab === 'account' && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800/80 dark:bg-slate-800/40">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      Account Details
                    </h3>

                    <div className="mt-4 space-y-3 text-xs">
                      <div className="flex items-center justify-between py-2 border-b border-slate-200/60 dark:border-slate-700/60">
                        <span className="text-slate-500 dark:text-slate-400">Email address</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{user?.email || 'N/A'}</span>
                      </div>

                      <div className="flex items-center justify-between py-2 border-b border-slate-200/60 dark:border-slate-700/60">
                        <span className="text-slate-500 dark:text-slate-400">Verification status</span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" /> Verified
                        </span>
                      </div>

                      <div className="flex items-center justify-between py-2">
                        <span className="text-slate-500 dark:text-slate-400">Account ID</span>
                        <span className="font-mono text-[11px] text-slate-600 dark:text-slate-300">{user?.id || user?._id || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex flex-shrink-0 justify-end border-t border-slate-100 p-4 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setShowSettingsModal(false);
                  handleCancelAvatarPreview();
                }}
                aria-label="Close settings modal"
                className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================
          TOAST
      ================================================== */}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-[calc(100vw-2rem)] animate-fade-in-up">
          <div
            className={`rounded-2xl border px-4 py-3 text-sm font-medium shadow-xl ${
              toast.type ===
              'error'
                ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-950/70 dark:text-red-200'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/70 dark:text-emerald-200'
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;