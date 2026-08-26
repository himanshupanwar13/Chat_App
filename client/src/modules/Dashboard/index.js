import Avatar from '../../assets/avatar.svg';
import img1 from '../../assets/img1.svg';
import Input from '../../components/input';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { API_BASE_URL, SOCKET_URL } from '../../config';
import { useNavigate } from 'react-router-dom';

const EMOJI_OPTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

const getAuthHeaders = () => {
  const token = localStorage.getItem('user:token');

  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const Dashboard = () => {
  const navigate = useNavigate();

  const [user] = useState(() => {
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
    const newSocket = io(SOCKET_URL, {
      auth: {
        token: localStorage.getItem('user:token') || '',
      },
    });

    setSocket(newSocket);

    if (user?.id) {
      newSocket.emit('addUser', user.id);
    }

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
    const pickerHeight = 70;

    const roomAbove =
      messageBounds.top - viewportBounds.top;

    const roomBelow =
      viewportBounds.bottom - messageBounds.bottom;

    setReactionPickerPlacement({
      messageId,
      placement:
        roomAbove < pickerHeight && roomBelow >= pickerHeight
          ? 'below'
          : 'above',
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

            return {
              ...conv,
              lastMessage: {
                message: data.message,
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

    socket.on(
      'getMessage',
      handleIncomingMessage
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

    try {
      setLoadingMessages(true);
      setReplyingTo(null);
      setEditingMessage(null);
      setTypingData(null);
      setHasMoreMessages(true);
      setLoadingOlderMessages(false);
      loadingOlderRef.current = false;
      isInitialLoadRef.current = true;
      isPrependingRef.current = false;
      prevScrollSnapshotRef.current = null;

      const res = await fetch(
        `${API_BASE_URL}/api/message/${conversationId}?limit=30&senderId=${user.id}&&receiverId=${receiver.receiverId}`,
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
        receiver,
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
        senderId: receiver.receiverId,
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
      !message.trim() ||
      !messages?.receiver ||
      !user?.id
    ) {
      return;
    }

    const trimmedMessage =
      message.trim();

    if (isTypingRef.current) {
      isTypingRef.current = false;

      socket?.emit('stopTyping', {
        senderId: user.id,
        receiverId:
          messages.receiver.receiverId,
        conversationId:
          messages.conversationId,
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
          throw new Error(
            'Failed to edit message'
          );
        }

        setMessages((prev) => ({
          ...prev,
          messages:
            prev.messages.map((m) =>
              String(
                m._id || m.id
              ) ===
              String(
                editingMessage.id
              )
                ? {
                    ...m,
                    message:
                      trimmedMessage,
                    isEdited: true,
                  }
                : m
            ),
        }));

        socket?.emit('editMessage', {
          messageId:
            editingMessage.id,
          conversationId:
            messages.conversationId,
          senderId: user.id,
          receiverId:
            messages.receiver
              .receiverId,
          message:
            trimmedMessage,
        });

        setEditingMessage(null);
        setMessage('');
      } catch (err) {
        setToast({
          type: 'error',
          message:
            'Failed to update message.',
        });
      } finally {
        setSending(false);
      }

      return;
    }

    // --------------------------------------------------
    // Optimistic Message
    // --------------------------------------------------

    const tempId =
      'temp_' + Date.now();

    const optimisticMessage = {
      _id: tempId,
      id: tempId,
      conversationId:
        messages.conversationId,
      senderId: user.id,
      message:
        trimmedMessage,
      status: isUserOnline(
        messages.receiver
          .receiverId
      )
        ? 'delivered'
        : 'sent',
      replyTo:
        replyingTo || null,
      reactions: [],
      isEdited: false,
      isDeleted: false,
      createdAt:
        new Date().toISOString(),
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
      messages: [
        ...prev.messages,
        optimisticMessage,
      ],
    }));

    setMessage('');

    const currentReply =
      replyingTo;

    setReplyingTo(null);

    try {
      setSending(true);

      const res = await fetch(
        `${API_BASE_URL}/api/message`,
        {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            conversationId:
              messages.conversationId,
            senderId: user.id,
            message:
              trimmedMessage,
            receiverId:
              messages.receiver
                .receiverId,
            replyTo:
              currentReply,
          }),
        }
      );

      if (!res.ok) {
        throw new Error(
          'Failed to send message'
        );
      }

      const savedMessage =
        await res.json();

      setMessages((prev) => ({
        ...prev,
        conversationId:
          savedMessage.conversationId ||
          prev.conversationId,
        messages:
          prev.messages.map((m) =>
            m._id === tempId
              ? savedMessage
              : m
          ),
      }));

      socket?.emit(
        'sendMessage',
        {
          _id:
            savedMessage._id,
          senderId: user.id,
          receiverId:
            messages.receiver
              .receiverId,
          message:
            trimmedMessage,
          conversationId:
            savedMessage.conversationId ||
            messages.conversationId,
          replyTo:
            currentReply,
          createdAt:
            savedMessage.createdAt,
        }
      );

      fetchConversationsList();
    } catch (error) {
      setToast({
        type: 'error',
        message:
          'Your message could not be sent.',
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
    setReplyingTo({
      id: msg._id || msg.id,
      message: msg.message,
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
                    <div className="relative flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-violet-200 bg-violet-100 p-1 dark:border-violet-500/30 dark:bg-violet-500/10">
                      <img
                        src={Avatar}
                        alt="User avatar"
                        className="h-full w-full rounded-full object-cover"
                      />

                      <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-900" />
                    </div>

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
                      aria-label="Open people"
                      title="Find people"
                      onClick={() => setShowPeoplePanel(true)}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-sm shadow-sm transition hover:border-violet-200 hover:text-violet-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 lg:hidden"
                    >
                      👥
                    </button>

                    <button
                      type="button"
                      aria-label="Toggle theme"
                      onClick={() =>
                        setDarkMode(
                          (prev) => !prev
                        )
                      }
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-sm shadow-sm transition hover:border-violet-200 hover:text-violet-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      {darkMode
                        ? '☀️'
                        : '🌙'}
                    </button>

                    <button
                      type="button"
                      title="Log out"
                      onClick={
                        handleLogout
                      }
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-sm text-red-500 shadow-sm transition hover:border-red-200 hover:bg-red-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-red-950/40"
                    >
                      🚪
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
                      ⌕
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
                    className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 shadow-xs transition hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-950/50 dark:text-violet-300 lg:hidden"
                    aria-label="Find people"
                  >
                    <span>👥</span>
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
                            <div className="relative flex-shrink-0">
                              <img
                                src={img1}
                                alt={
                                  conversationUser?.fullName ||
                                  'Contact'
                                }
                                className="h-11 w-11 rounded-full border border-violet-200 object-cover dark:border-violet-500/20"
                              />

                              <span
                                className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white dark:border-slate-800 ${
                                  isOnline
                                    ? 'bg-emerald-500'
                                    : 'bg-slate-300 dark:bg-slate-600'
                                }`}
                              />
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-1">
                                <div className="flex min-w-0 items-center gap-1.5">
                                  {isPinned && (
                                    <span className="flex-shrink-0 text-xs text-amber-500">
                                      📌
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
                              className="absolute right-2 top-2 hidden rounded-full p-1 text-xs text-slate-400 opacity-0 transition group-hover:block group-hover:opacity-100 hover:text-amber-500"
                            >
                              {isPinned
                                ? '📍'
                                : '📌'}
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
                    className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-base text-slate-700 lg:hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
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
                    ←
                  </button>

                  {messages?.receiver
                    ?.fullName ? (
                    <>
                      <div className="relative flex-shrink-0">
                        <img
                          src={img1}
                          alt={
                            messages.receiver
                              .fullName
                          }
                          className="h-11 w-11 rounded-full border border-violet-200 object-cover dark:border-violet-500/20"
                        />

                        <span
                          className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white dark:border-slate-900 ${
                            isUserOnline(
                              messages
                                .receiver
                                .receiverId
                            )
                              ? 'bg-emerald-500'
                              : 'bg-slate-300 dark:bg-slate-600'
                          }`}
                        />
                      </div>

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
                      onClick={(e) =>
                        togglePinConversation(
                          messages.conversationId,
                          e
                        )
                      }
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-600 transition hover:border-violet-200 hover:text-violet-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      title="Pin/Unpin Conversation"
                    >
                      {pinnedConversations.includes(
                        messages.conversationId
                      )
                        ? '📍'
                        : '📌'}
                    </button>
                  )}

                  <button
                    type="button"
                    className="inline-flex rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition hover:border-violet-200 hover:text-violet-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 lg:hidden"
                    aria-label="Open people panel"
                    onClick={() =>
                      setShowPeoplePanel(
                        (prev) => !prev
                      )
                    }
                  >
                    👥
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
                            <span className="h-2 w-2 rounded-full bg-violet-600 animate-ping" />
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
                                className={`group relative flex min-w-0 flex-col ${
                                  isCurrentUser
                                    ? 'items-end'
                                    : 'items-start'
                                } animate-fade-in-up`}
                              >
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

                                {/* Message + Action Bar */}
                                <div className="relative flex min-w-0 items-start gap-1.5">

                                  {/* Action Bar */}
                                  {!isDeleted && (
                                    <div
                                      className={`absolute z-30 hidden max-w-[calc(100vw-2rem)] items-center gap-1 whitespace-nowrap rounded-2xl border border-slate-200 bg-white/95 px-2 py-1 shadow-lg group-hover:flex dark:border-slate-700 dark:bg-slate-800/95 ${
                                        reactionPickerPlacement.messageId ===
                                          messageId &&
                                        reactionPickerPlacement.placement ===
                                          'below'
                                          ? 'top-full mt-2'
                                          : 'bottom-full mb-2'
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
                                        title="Reply"
                                        onClick={() =>
                                          handleStartReply(
                                            msg,
                                            isCurrentUser
                                          )
                                        }
                                        className="rounded p-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-violet-600 dark:text-slate-400 dark:hover:bg-slate-700"
                                      >
                                        ↩
                                      </button>

                                      {/* Edit */}
                                      {isCurrentUser && (
                                        <button
                                          type="button"
                                          title="Edit message"
                                          onClick={() =>
                                            handleStartEdit(
                                              msg
                                            )
                                          }
                                          className="rounded p-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-violet-600 dark:text-slate-400 dark:hover:bg-slate-700"
                                        >
                                          ✏️
                                        </button>
                                      )}

                                      {/* Delete */}
                                      {isCurrentUser && (
                                        <button
                                          type="button"
                                          title="Delete message"
                                          onClick={() =>
                                            handleDeleteMessage(
                                              messageId
                                            )
                                          }
                                          className="rounded p-1 text-xs text-slate-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/40"
                                        >
                                          🗑️
                                        </button>
                                      )}
                                    </div>
                                  )}

                                  {/* Message Bubble */}
                                  <div
                                    className={`w-fit min-w-[80px] max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-sm sm:max-w-[75%] ${
                                      isCurrentUser
                                        ? isDeleted
                                          ? 'rounded-br-md border border-slate-300 bg-slate-100 text-slate-400 italic dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500'
                                          : 'rounded-br-md bg-gradient-to-r from-violet-600 to-indigo-600 text-white'
                                        : isDeleted
                                        ? 'rounded-bl-md border border-slate-200 bg-slate-50 text-slate-400 italic dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500'
                                        : 'rounded-bl-md bg-white text-slate-800 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700'
                                    }`}
                                  >
                                    <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed">
                                      {
                                        msg.message
                                      }
                                    </p>

                                    {/* Footer */}
                                    <div
                                      className={`mt-1 flex items-center justify-end gap-1.5 whitespace-nowrap text-[10px] ${
                                        isCurrentUser &&
                                        !isDeleted
                                          ? 'text-violet-200'
                                          : 'text-slate-400 dark:text-slate-500'
                                      }`}
                                    >
                                      {isEdited &&
                                        !isDeleted && (
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
                                      {isCurrentUser &&
                                        !isDeleted && (
                                          <span className="ml-0.5 font-bold">
                                            {msg.status ===
                                            'read' ? (
                                              <span
                                                className="text-sky-300"
                                                title="Read"
                                              >
                                                ✓✓
                                              </span>
                                            ) : msg.status ===
                                              'delivered' ? (
                                              <span
                                                className="text-violet-200"
                                                title="Delivered"
                                              >
                                                ✓✓
                                              </span>
                                            ) : (
                                              <span
                                                className="text-violet-300"
                                                title="Sent"
                                              >
                                                ✓
                                              </span>
                                            )}
                                          </span>
                                        )}
                                    </div>
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
                          onClick={() =>
                            setReplyingTo(
                              null
                            )
                          }
                          className="ml-2 flex-shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          ✕
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
                          onClick={() => {
                            setEditingMessage(
                              null
                            );
                            setMessage('');
                          }}
                          className="ml-2 flex-shrink-0 text-amber-600 hover:text-amber-800 dark:text-amber-400"
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    {/* Input */}
                    <form
                      onSubmit={
                        sendMessage
                      }
                      className="mx-auto flex w-full max-w-3xl items-center gap-2 sm:gap-3"
                    >
                      <div className="relative min-w-0 flex-1">
                        <input
                          ref={inputRef}
                          name="message"
                          placeholder={
                            editingMessage
                              ? 'Edit your message...'
                              : replyingTo
                              ? 'Type your reply...'
                              : 'Type your message…'
                          }
                          value={
                            message
                          }
                          onChange={
                            handleInputChange
                          }
                          className="block w-full rounded-full border border-slate-200 bg-slate-50 px-5 py-3 text-sm text-slate-800 shadow-inner transition focus:border-violet-500 focus:outline-none focus:ring-4 focus:ring-violet-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-violet-500/20"
                          autoComplete="off"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={
                          !message.trim() ||
                          sending
                        }
                        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 text-lg text-white shadow-lg shadow-violet-500/20 transition hover:-translate-y-[1px] hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label="Send message"
                      >
                        {sending
                          ? '…'
                          : '➤'}
                      </button>
                    </form>
                  </div>
                </>
              ) : (
                /* Empty Chat State */
                <div className="flex min-h-0 flex-1 items-center justify-center p-8">
                  <div className="max-w-md rounded-[28px] border border-dashed border-violet-200 bg-white/80 p-8 text-center shadow-sm dark:border-violet-500/20 dark:bg-slate-900/80">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-violet-100 text-2xl dark:bg-violet-500/10">
                      💬
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
                      onClick={() =>
                        setShowPeoplePanel(
                          false
                        )
                      }
                      className="rounded-lg p-1 text-slate-400 hover:text-slate-600 lg:hidden dark:hover:text-slate-200"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* People Search */}
                <div className="mb-4">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                      ⌕
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
                            <div className="relative flex-shrink-0">
                              <img
                                src={img1}
                                alt={
                                  person?.fullName ||
                                  'User'
                                }
                                className="h-11 w-11 rounded-full border border-violet-200 object-cover dark:border-violet-500/20"
                              />

                              <span
                                className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white dark:border-slate-800 ${
                                  isOnline
                                    ? 'bg-emerald-500'
                                    : 'bg-slate-300 dark:bg-slate-600'
                                }`}
                              />
                            </div>

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