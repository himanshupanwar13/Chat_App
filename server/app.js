const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
const mongoose = require('mongoose');
const { sendOtpEmail } = require('./services/emailService');
const { processAttachmentUpload, processAvatarUpload, deleteCloudinaryAsset, MAX_FILE_SIZE, MAX_AVATAR_SIZE } = require('./services/uploadService');
const { extractBearerToken, getJwtSecret, requireAuth, verifyJwt } = require('./middleware/auth');
const { findConversationByMembers, getOrCreateDirectConversation, getOtherMemberId, isConversationMember, toIdString } = require('./utils/chat');

getJwtSecret();
const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 8000;

const parseAllowedOrigins = () => {
  const defaults = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://chatterflow.tech',
    'https://www.chatterflow.tech',
    'https://chatterflow.vercel.app',
  ];
  const custom = (process.env.CLIENT_URL || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  return Array.from(new Set([...defaults, ...custom]));
};

const allowedOrigins = parseAllowedOrigins();

const io = require('socket.io')(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 20000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
});

require('./db/connection');
const Users = require('./models/users');
const Conversations = require('./models/Conversations');
const Messages = require('./models/Messages');

// ==========================================
// RATE LIMITERS
// ==========================================
const createLimiter = (max, windowMs, message) => rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: message || 'Too many requests, please try again later.' },
  skip: () => process.env.NODE_ENV === 'test',
});

const apiLimiter = createLimiter(600, 15 * 60 * 1000, 'Too many requests from this IP. Please try again in 15 minutes.');
const authLimiter = createLimiter(30, 15 * 60 * 1000, 'Too many authentication attempts. Please try again in 15 minutes.');
const uploadLimiter = createLimiter(40, 15 * 60 * 1000, 'Upload rate limit exceeded. Please try again later.');
const passwordLimiter = createLimiter(15, 15 * 60 * 1000, 'Too many password update attempts. Please try again later.');

const OTP_EXPIRY_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_PURPOSES = new Set(['signup', 'login', 'forgot-password']);
const onlineSocketsByUser = new Map();
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const createJwtToken = (user) => jwt.sign({ userId: user._id, email: user.email }, getJwtSecret(), { expiresIn: 84600 });
const createResetAuthorizationToken = (user) => jwt.sign({ userId: user._id, email: user.email, purpose: 'forgot-password-reset' }, getJwtSecret(), { expiresIn: 600 });
const standardUserResponse = (user) => ({ id: user._id, _id: user._id, email: user.email, fullName: user.fullName, avatar: user.avatar || null });
const isOnline = (userId) => (onlineSocketsByUser.get(toIdString(userId))?.size || 0) > 0;
const addOnlineSocket = (userId, socketId) => {
  const id = toIdString(userId); const sockets = onlineSocketsByUser.get(id) || new Set();
  sockets.add(socketId); onlineSocketsByUser.set(id, sockets);
};
const removeOnlineSocket = (userId, socketId) => {
  const id = toIdString(userId); const sockets = onlineSocketsByUser.get(id);
  if (!sockets) return; sockets.delete(socketId); if (!sockets.size) onlineSocketsByUser.delete(id);
};
const emitPresence = () => io.emit('getUsers', [...onlineSocketsByUser.keys()].map((userId) => ({ userId })));
const emitToUser = (userId, event, payload) => io.to(`user:${toIdString(userId)}`).emit(event, payload);
const clearOtpState = (user) => { user.otpHash = null; user.otpExpiry = null; user.otpAttempts = 0; user.otpRequestedAt = null; };

const issueOtpForUser = async (user, purpose) => {
  if (user.otpRequestedAt && Date.now() - new Date(user.otpRequestedAt).getTime() < OTP_RESEND_COOLDOWN_MS) return { cooldown: true };
  const otp = String(crypto.randomInt(100000, 1000000));
  user.otpHash = await bcryptjs.hash(otp, 10); user.otpExpiry = new Date(Date.now() + OTP_EXPIRY_MS);
  user.otpAttempts = 0; user.otpRequestedAt = new Date(); await user.save();
  await sendOtpEmail({ email: user.email, otp, purpose }); return { cooldown: false };
};
const findUserByNormalizedEmail = (email) => {
  const normalized = normalizeEmail(email);
  return Users.findOne({ $or: [{ emailNormalized: normalized }, { email: normalized }] });
};
const getVerifiedRecipient = async (receiverId, senderId) => {
  if (!receiverId || toIdString(receiverId) === toIdString(senderId)) return null;
  return Users.findOne({ _id: receiverId, emailVerified: true }).select('_id email fullName avatar lastSeen updatedAt');
};
const requireConversationMember = async (conversationId, userId) => {
  if (!conversationId || conversationId === 'new') return null;
  const conversation = await Conversations.findById(conversationId);
  return conversation && isConversationMember(conversation, userId) ? conversation : null;
};
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_SIZE },
});

const buildMessageResponse = async (message) => {
  const sender = await Users.findById(message.senderId).select('_id email fullName avatar');
  return {
    _id: message._id,
    id: message._id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    message: message.isDeleted ? 'This message was deleted' : (message.message || ''),
    attachments: message.isDeleted ? [] : (message.attachments || []),
    status: message.status,
    replyTo: message.replyTo || null,
    reactions: message.reactions || [],
    isEdited: Boolean(message.isEdited),
    isDeleted: Boolean(message.isDeleted),
    createdAt: message.createdAt,
    user: {
      id: sender?._id || message.senderId,
      email: sender?.email || '',
      fullName: sender?.fullName || 'User',
      avatar: sender?.avatar || null,
    },
  };
};
const requireSocketConversationMember = async (socket, conversationId, receiverId) => {
  const conversation = await requireConversationMember(conversationId, socket.data.userId);
  if (!conversation) return null;
  const otherMemberId = getOtherMemberId(conversation, socket.data.userId);
  if (receiverId && toIdString(receiverId) !== toIdString(otherMemberId)) return null;
  return { conversation, otherMemberId };
};

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    return callback(new Error(`Origin ${origin} not allowed by CORS policy.`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));
app.use('/api', apiLimiter);

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || extractBearerToken(socket.handshake.headers.authorization);
    if (!token) return next(new Error('Authentication required.'));
    const payload = verifyJwt(token);
    const user = await Users.findOne({ _id: payload.userId, emailVerified: true }).select('_id');
    if (!user) return next(new Error('Invalid authentication token.'));
    socket.data.userId = toIdString(user._id); return next();
  } catch (error) { return next(new Error('Invalid or expired authentication token.')); }
});

io.on('connection', (socket) => {
  const userId = socket.data.userId;
  socket.join(`user:${userId}`); addOnlineSocket(userId, socket.id); emitPresence();
  // Retained for client compatibility. Identity always comes from the verified socket token.
  socket.on('addUser', () => { addOnlineSocket(userId, socket.id); emitPresence(); });
  socket.on('sendMessage', async ({ _id, conversationId, receiverId }) => {
    try {
      const message = await Messages.findById(_id);
      if (!message || toIdString(message.senderId) !== userId || toIdString(message.conversationId) !== toIdString(conversationId)) return;
      const membership = await requireSocketConversationMember(socket, message.conversationId, receiverId); if (!membership) return;
      if (isOnline(membership.otherMemberId) && message.status === 'sent') { message.status = 'delivered'; await message.save(); }
      const payload = await buildMessageResponse(message); emitToUser(membership.otherMemberId, 'getMessage', payload); emitToUser(userId, 'getMessage', payload);
    } catch { socket.emit('chatError', { event: 'sendMessage', message: 'Unable to deliver message.' }); }
  });
  socket.on('typing', async ({ conversationId, receiverId }) => {
    const membership = await requireSocketConversationMember(socket, conversationId, receiverId); if (!membership) return;
    const user = await Users.findById(userId).select('fullName');
    emitToUser(membership.otherMemberId, 'userTyping', { senderId: userId, receiverId: membership.otherMemberId, conversationId, senderName: user?.fullName || 'Someone' });
  });
  socket.on('stopTyping', async ({ conversationId, receiverId }) => {
    const membership = await requireSocketConversationMember(socket, conversationId, receiverId); if (!membership) return;
    emitToUser(membership.otherMemberId, 'userStoppedTyping', { senderId: userId, receiverId: membership.otherMemberId, conversationId });
  });
  socket.on('reactMessage', async ({ messageId, conversationId, receiverId }) => {
    const message = await Messages.findById(messageId); if (!message || toIdString(message.conversationId) !== toIdString(conversationId)) return;
    const membership = await requireSocketConversationMember(socket, conversationId, receiverId); if (!membership) return;
    const payload = { messageId, conversationId, reactions: message.reactions || [] }; emitToUser(membership.otherMemberId, 'messageReacted', payload); emitToUser(userId, 'messageReacted', payload);
  });
  socket.on('editMessage', async ({ messageId, conversationId, receiverId }) => {
    const message = await Messages.findById(messageId);
    if (!message || toIdString(message.senderId) !== userId || toIdString(message.conversationId) !== toIdString(conversationId)) return;
    const membership = await requireSocketConversationMember(socket, conversationId, receiverId); if (!membership) return;
    const payload = { messageId, conversationId, message: message.message, isEdited: true }; emitToUser(membership.otherMemberId, 'messageEdited', payload); emitToUser(userId, 'messageEdited', payload);
  });
  socket.on('deleteMessage', async ({ messageId, conversationId, receiverId }) => {
    const message = await Messages.findById(messageId);
    if (!message || toIdString(message.senderId) !== userId || toIdString(message.conversationId) !== toIdString(conversationId)) return;
    const membership = await requireSocketConversationMember(socket, conversationId, receiverId); if (!membership) return;
    const payload = { messageId, conversationId }; emitToUser(membership.otherMemberId, 'messageDeleted', payload); emitToUser(userId, 'messageDeleted', payload);
  });
  socket.on('markAsRead', async ({ conversationId, senderId }) => {
    const membership = await requireSocketConversationMember(socket, conversationId, senderId); if (!membership) return;
    await Messages.updateMany({ conversationId: toIdString(conversationId), senderId: { $ne: userId }, status: { $ne: 'read' } }, { $set: { status: 'read' } });
    emitToUser(membership.otherMemberId, 'messagesRead', { conversationId, readerId: userId });
  });
  socket.on('disconnect', async () => { removeOnlineSocket(userId, socket.id); if (!isOnline(userId)) await Users.findByIdAndUpdate(userId, { lastSeen: new Date() }).catch(() => {}); emitPresence(); });
});

app.get('/', (req, res) => res.send('Welcome'));
app.post('/api/register', authLimiter, async (req, res) => {
  try {
    const { fullName, email, password } = req.body;
    if (!fullName || !email || !password) return res.status(400).json({ error: 'Please fill all required fields!' });
    const normalizedEmail = normalizeEmail(email); let user = await findUserByNormalizedEmail(normalizedEmail);
    if (user?.emailVerified) return res.status(400).json({ error: 'User already exists' });
    const hashedPassword = await bcryptjs.hash(password, 10);
    if (!user) user = new Users({ fullName, email: normalizedEmail, password: hashedPassword, emailVerified: false });
    else { user.fullName = fullName; user.email = normalizedEmail; user.password = hashedPassword; user.emailVerified = false; user.emailVerifiedAt = null; }
    user.token = null; await user.save();
    const otpResult = await issueOtpForUser(user, 'signup');
    if (otpResult.cooldown) return res.status(429).json({ error: 'Please wait before requesting a new code.' });
    return res.status(200).json({ message: 'Registration successful. Verify your email with OTP.', requiresEmailVerification: true, email: normalizedEmail });
  } catch (error) { if (error?.code === 11000) return res.status(409).json({ error: 'User already exists' }); console.error(error); return res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body; if (!email || !password) return res.status(400).json({ error: 'Please fill all required fields!' });
    const user = await findUserByNormalizedEmail(email);
    if (!user || !(await bcryptjs.compare(password, user.password))) return res.status(400).json({ error: 'User email or password is incorrect' });
    if (!user.emailVerified) return res.status(403).json({ error: 'Email verification required', requiresEmailVerification: true });
    const token = createJwtToken(user); user.token = token; await user.save(); return res.status(200).json({ user: standardUserResponse(user), token });
  } catch (error) { console.error(error); return res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/auth/send-otp', authLimiter, async (req, res) => {
  try {
    const { email, purpose } = req.body || {}; const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !OTP_PURPOSES.has(purpose)) return res.status(400).json({ error: 'Invalid request.' });
    const user = await findUserByNormalizedEmail(normalizedEmail);
    if (purpose === 'signup' && (!user || user.emailVerified)) return res.status(user ? 409 : 400).json({ error: user ? 'This email is already verified.' : 'Please complete signup before requesting OTP.' });
    if (purpose === 'login' && !user) return res.status(404).json({ error: 'Account not found.' });
    if (purpose === 'forgot-password' && !user) return res.status(200).json({ message: 'OTP sent successfully' });
    const otpResult = await issueOtpForUser(user, purpose); if (otpResult.cooldown) return res.status(429).json({ error: 'Please wait before requesting a new code.' });
    return res.status(200).json({ message: 'OTP sent successfully' });
  } catch (error) { console.error(error); return res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/auth/verify-otp', authLimiter, async (req, res) => {
  try {
    const { email, otp, purpose } = req.body || {};
    if (!normalizeEmail(email) || !/^\d{6}$/.test(String(otp || '')) || !OTP_PURPOSES.has(purpose)) return res.status(400).json({ error: 'Invalid request.' });
    const user = await findUserByNormalizedEmail(email);
    if (!user || !user.otpHash || !user.otpExpiry || new Date(user.otpExpiry).getTime() < Date.now()) { if (user) { clearOtpState(user); await user.save(); } return res.status(400).json({ error: 'Invalid or expired OTP' }); }
    if ((user.otpAttempts || 0) >= OTP_MAX_ATTEMPTS) { clearOtpState(user); await user.save(); return res.status(400).json({ error: 'Maximum OTP attempts exceeded. Request a new OTP.' }); }
    if (!(await bcryptjs.compare(String(otp), user.otpHash))) { user.otpAttempts = (user.otpAttempts || 0) + 1; if (user.otpAttempts >= OTP_MAX_ATTEMPTS) clearOtpState(user); await user.save(); return res.status(400).json({ error: 'Invalid or expired OTP' }); }
    clearOtpState(user);
    if (purpose === 'signup') { user.emailVerified = true; user.emailVerifiedAt = new Date(); await user.save(); return res.status(200).json({ message: 'Email verified successfully' }); }
    if (purpose === 'login') { user.emailVerified = true; user.emailVerifiedAt = user.emailVerifiedAt || new Date(); const token = createJwtToken(user); user.token = token; await user.save(); return res.status(200).json({ message: 'OTP verified successfully', token, user: standardUserResponse(user) }); }
    await user.save(); return res.status(200).json({ message: 'OTP verified successfully', resetAuthorization: createResetAuthorizationToken(user), expiresIn: 600 });
  } catch (error) { console.error(error); return res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/auth/reset-password', authLimiter, async (req, res) => {
  try {
    const { email, resetAuthorization, newPassword, confirmPassword } = req.body || {};
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !resetAuthorization || !newPassword) {
      return res.status(400).json({ error: 'Please provide all required fields.' });
    }

    if (confirmPassword !== undefined && newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    let payload;
    try {
      payload = verifyJwt(resetAuthorization);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired password reset token. Please request a new code.' });
    }

    if (!payload?.userId || payload?.purpose !== 'forgot-password-reset') {
      return res.status(401).json({ error: 'Invalid reset authorization token.' });
    }

    if (normalizeEmail(payload.email) !== normalizedEmail) {
      return res.status(400).json({ error: 'Email does not match reset authorization.' });
    }

    const user = await Users.findById(payload.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (user.passwordResetAt) {
      const resetTime = new Date(user.passwordResetAt).getTime();
      const tokenIssuedAt = (payload.iat || 0) * 1000;
      if (tokenIssuedAt <= resetTime) {
        return res.status(401).json({ error: 'This reset token has already been used. Please request a new code.' });
      }
    }

    const hashedPassword = await bcryptjs.hash(newPassword, 10);
    user.password = hashedPassword;
    user.passwordResetAt = new Date();
    user.token = null;
    clearOtpState(user);
    await user.save();

    return res.status(200).json({ message: 'Password reset successfully. You can now log in with your new password.' });
  } catch (error) {
    console.error('Password reset error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ==========================================
// USER PROFILE & ACCOUNT SETTINGS ENDPOINTS
// ==========================================

app.get('/api/profile', requireAuth, async (req, res) => {
  try {
    const user = await Users.findById(req.auth.userId).select('_id email fullName avatar emailVerified createdAt updatedAt');
    if (!user) return res.status(404).json({ error: 'User not found.' });

    return res.status(200).json({
      _id: user._id,
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      avatar: user.avatar || null,
      emailVerified: Boolean(user.emailVerified),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/profile', requireAuth, async (req, res) => {
  try {
    const { fullName } = req.body || {};
    const trimmed = String(fullName || '').trim();

    if (!trimmed || trimmed.length < 2 || trimmed.length > 50) {
      return res.status(400).json({ error: 'Full name must be between 2 and 50 characters.' });
    }

    const user = await Users.findById(req.auth.userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    user.fullName = trimmed;
    await user.save();

    io.emit('profileUpdated', {
      userId: user._id,
      fullName: user.fullName,
      avatar: user.avatar || null,
    });

    return res.status(200).json({
      message: 'Profile updated successfully',
      user: {
        _id: user._id,
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        avatar: user.avatar || null,
        emailVerified: Boolean(user.emailVerified),
      },
    });
  } catch (error) {
    console.error('Profile update error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/profile/avatar', requireAuth, uploadLimiter, (req, res, next) => {
  avatarUpload.single('avatar')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Image must be 5 MB or smaller.' });
      }
      return res.status(400).json({ error: err.message || 'Avatar upload error.' });
    }
    next();
  });
}, async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No avatar image file uploaded.' });
    }

    const user = await Users.findById(req.auth.userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const oldPublicId = user.avatar?.publicId;

    const result = await processAvatarUpload({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      userId: req.auth.userId,
    });

    user.avatar = {
      url: result.url,
      publicId: result.publicId,
    };
    await user.save();

    if (oldPublicId && oldPublicId !== result.publicId) {
      deleteCloudinaryAsset(oldPublicId).catch(() => {});
    }

    io.emit('profileUpdated', {
      userId: user._id,
      fullName: user.fullName,
      avatar: user.avatar,
    });

    return res.status(200).json({
      message: 'Avatar updated successfully',
      avatar: user.avatar,
    });
  } catch (error) {
    console.error('Avatar upload error:', error);
    const statusCode = error.statusCode || (error.code === 'LIMIT_FILE_SIZE' ? 400 : 500);
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'Image must be 5 MB or smaller.'
      : (error.message || 'Avatar upload failed.');
    return res.status(statusCode).json({ error: message });
  }
});

app.delete('/api/profile/avatar', requireAuth, async (req, res) => {
  try {
    const user = await Users.findById(req.auth.userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    if (user.avatar?.publicId) {
      deleteCloudinaryAsset(user.avatar.publicId).catch(() => {});
    }

    user.avatar = { url: null, publicId: null };
    await user.save();

    io.emit('profileUpdated', {
      userId: user._id,
      fullName: user.fullName,
      avatar: null,
    });

    return res.status(200).json({
      message: 'Avatar removed successfully',
      avatar: null,
    });
  } catch (error) {
    console.error('Avatar removal error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/profile/password', requireAuth, passwordLimiter, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body || {};

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'New password and confirmation do not match.' });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ error: 'New password must be different from current password.' });
    }

    const user = await Users.findById(req.auth.userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const isMatch = await bcryptjs.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }

    user.password = await bcryptjs.hash(newPassword, 10);
    user.passwordResetAt = new Date();
    user.token = null;
    await user.save();

    return res.status(200).json({ message: 'Password changed successfully.' });
  } catch (error) {
    console.error('Password change error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

const formatLastMessageText = (msg) => {
  if (!msg) return '';
  if (msg.isDeleted) return 'This message was deleted';
  if (msg.message && String(msg.message).trim()) return msg.message;
  if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
    const first = msg.attachments[0];
    if (first.type === 'image') return '📷 Photo';
    return `📄 ${first.fileName || 'Document'}`;
  }
  return '';
};

app.post('/api/upload', requireAuth, uploadLimiter, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File size exceeds maximum allowed limit of 25 MB.' });
      }
      return res.status(400).json({ error: err.message || 'File upload error.' });
    }
    next();
  });
}, async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const { conversationId, receiverId } = req.body || {};
    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required.' });
    }

    if (conversationId === 'new') {
      const receiver = await getVerifiedRecipient(receiverId, req.auth.userId);
      if (!receiver) {
        return res.status(400).json({ error: 'A verified recipient is required.' });
      }
    } else {
      const conversation = await requireConversationMember(conversationId, req.auth.userId);
      if (!conversation) {
        return res.status(403).json({ error: 'Conversation access denied.' });
      }
    }

    const attachment = await processAttachmentUpload({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      conversationId,
    });

    return res.status(200).json(attachment);
  } catch (error) {
    console.error('Upload error:', error);
    const statusCode = error.statusCode || (error.code === 'LIMIT_FILE_SIZE' ? 400 : 500);
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'File size exceeds maximum allowed limit of 25 MB.'
      : (error.message || 'File upload failed.');
    return res.status(statusCode).json({ error: message });
  }
});

app.post('/api/conversation', requireAuth, async (req, res) => {
  try { const receiver = await getVerifiedRecipient(req.body.receiverId, req.auth.userId); if (!receiver) return res.status(400).json({ error: 'A verified recipient is required.' }); const conversation = await getOrCreateDirectConversation(req.auth.userId, receiver._id); return res.status(200).json({ conversationId: conversation._id }); }
  catch (error) { console.error(error); return res.status(500).json({ error: 'Server error' }); }
});
app.get('/api/conversations/:userId', requireAuth, async (req, res) => {
  try {
    if (toIdString(req.params.userId) !== req.auth.userId) return res.status(403).json({ error: 'Unauthorized.' });
    const conversations = await Conversations.find({ members: req.auth.userId }).sort({ updatedAt: -1 });
    const data = await Promise.all(conversations.map(async (conversation) => {
      const receiverId = getOtherMemberId(conversation, req.auth.userId); const receiver = await Users.findById(receiverId).select('_id email fullName avatar lastSeen updatedAt');
      const lastMessage = await Messages.findOne({ conversationId: toIdString(conversation._id) }).sort({ createdAt: -1 });
      const unreadCount = await Messages.countDocuments({ conversationId: toIdString(conversation._id), senderId: receiverId, status: { $ne: 'read' }, isDeleted: { $ne: true } });
      return { user: { receiverId: receiver?._id || receiverId, email: receiver?.email || '', fullName: receiver?.fullName || 'User', avatar: receiver?.avatar || null, lastSeen: receiver?.lastSeen || receiver?.updatedAt || null }, conversationId: conversation._id,
        lastMessage: lastMessage ? { message: formatLastMessageText(lastMessage), createdAt: lastMessage.createdAt, senderId: lastMessage.senderId, status: lastMessage.status } : null, unreadCount };
    })); return res.status(200).json(data);
  } catch (error) { console.error(error); return res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/message', requireAuth, async (req, res) => {
  try {
    const { conversationId, receiverId, message = '', attachments = [], replyTo = null } = req.body;
    const trimmedMessage = String(message || '').trim();
    const validAttachments = Array.isArray(attachments) ? attachments : [];

    if (!trimmedMessage && validAttachments.length === 0) {
      return res.status(400).json({ error: 'A message or attachment is required.' });
    }

    let conversation;
    let receiver;
    if (conversationId === 'new') {
      receiver = await getVerifiedRecipient(receiverId, req.auth.userId);
      if (!receiver) return res.status(400).json({ error: 'A verified recipient is required.' });
      conversation = await getOrCreateDirectConversation(req.auth.userId, receiver._id);
    } else {
      conversation = await requireConversationMember(conversationId, req.auth.userId);
      if (!conversation) return res.status(403).json({ error: 'Conversation access denied.' });
      const otherId = getOtherMemberId(conversation, req.auth.userId);
      if (receiverId && toIdString(receiverId) !== toIdString(otherId)) {
        return res.status(400).json({ error: 'Invalid conversation recipient.' });
      }
      receiver = await Users.findById(otherId).select('_id');
      if (!receiver) return res.status(404).json({ error: 'Conversation recipient not found.' });
    }

    const saved = await new Messages({
      conversationId: toIdString(conversation._id),
      senderId: req.auth.userId,
      message: trimmedMessage,
      attachments: validAttachments,
      replyTo,
      status: isOnline(receiver._id) ? 'delivered' : 'sent',
    }).save();

    await Conversations.findByIdAndUpdate(conversation._id, { $set: { updatedAt: new Date() } });
    return res.status(200).json(await buildMessageResponse(saved));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Server error' });
  }
});
app.get('/api/message/:conversationId', requireAuth, async (req, res) => {
  try {
    let conversation;
    if (req.params.conversationId === 'new') {
      const receiver = await getVerifiedRecipient(req.query.receiverId, req.auth.userId);
      if (!receiver) return res.status(400).json({ error: 'A verified recipient is required.' });
      conversation = await findConversationByMembers(req.auth.userId, receiver._id);
      if (!conversation) return res.status(200).json({ messages: [], hasMore: false, nextCursor: null, oldestId: null });
    } else {
      conversation = await requireConversationMember(req.params.conversationId, req.auth.userId);
      if (!conversation) return res.status(403).json({ error: 'Conversation access denied.' });
    }

    const rawLimit = parseInt(req.query.limit, 10);
    const limit = isNaN(rawLimit) || rawLimit <= 0 ? 30 : Math.min(rawLimit, 50);
    const { before, beforeId } = req.query;

    const query = { conversationId: toIdString(conversation._id) };
    if (before) {
      const beforeDate = new Date(before);
      if (!isNaN(beforeDate.getTime())) {
        if (beforeId && mongoose.Types.ObjectId.isValid(beforeId)) {
          query.$or = [
            { createdAt: { $lt: beforeDate } },
            { createdAt: beforeDate, _id: { $lt: new mongoose.Types.ObjectId(beforeId) } }
          ];
        } else {
          query.createdAt = { $lt: beforeDate };
        }
      }
    } else if (beforeId && mongoose.Types.ObjectId.isValid(beforeId)) {
      query._id = { $lt: new mongoose.Types.ObjectId(beforeId) };
    }

    const rawRows = await Messages.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1);

    const hasMore = rawRows.length > limit;
    const pageRows = hasMore ? rawRows.slice(0, limit) : rawRows;
    pageRows.reverse();

    const formattedMessages = await Promise.all(pageRows.map(buildMessageResponse));
    const oldestMessage = formattedMessages[0] || null;

    return res.status(200).json({
      messages: formattedMessages,
      hasMore,
      nextCursor: oldestMessage ? oldestMessage.createdAt : null,
      oldestId: oldestMessage ? (oldestMessage._id || oldestMessage.id) : null
    });
  } catch (error) { console.error(error); return res.status(500).json({ error: 'Server error' }); }
});
app.put('/api/message/:id', requireAuth, async (req, res) => {
  try { const message = await Messages.findById(req.params.id); if (!message) return res.status(404).json({ error: 'Message not found.' }); if (toIdString(message.senderId) !== req.auth.userId) return res.status(403).json({ error: 'Unauthorized to edit this message.' }); if (!(await requireConversationMember(message.conversationId, req.auth.userId))) return res.status(403).json({ error: 'Conversation access denied.' }); if (!String(req.body.message || '').trim()) return res.status(400).json({ error: 'A message is required.' }); message.message = String(req.body.message).trim(); message.isEdited = true; await message.save(); return res.status(200).json(await buildMessageResponse(message)); }
  catch (error) { console.error(error); return res.status(500).json({ error: 'Server error' }); }
});
app.delete('/api/message/:id', requireAuth, async (req, res) => {
  try { const message = await Messages.findById(req.params.id); if (!message) return res.status(404).json({ error: 'Message not found.' }); if (toIdString(message.senderId) !== req.auth.userId) return res.status(403).json({ error: 'Unauthorized to delete this message.' }); if (!(await requireConversationMember(message.conversationId, req.auth.userId))) return res.status(403).json({ error: 'Conversation access denied.' }); message.isDeleted = true; message.message = 'This message was deleted'; await message.save(); return res.status(200).json({ message: 'Message deleted successfully', id: message._id }); }
  catch (error) { console.error(error); return res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/message/react', requireAuth, async (req, res) => {
  try { const { messageId, emoji } = req.body; if (!messageId || !emoji) return res.status(400).json({ error: 'Missing required fields.' }); const message = await Messages.findById(messageId); if (!message) return res.status(404).json({ error: 'Message not found.' }); if (!(await requireConversationMember(message.conversationId, req.auth.userId))) return res.status(403).json({ error: 'Conversation access denied.' }); let reactions = message.reactions || []; const existing = reactions.findIndex((r) => toIdString(r.userId) === req.auth.userId && r.emoji === emoji); if (existing >= 0) reactions.splice(existing, 1); else { reactions = reactions.filter((r) => toIdString(r.userId) !== req.auth.userId); reactions.push({ userId: req.auth.userId, emoji }); } message.reactions = reactions; await message.save(); return res.status(200).json({ messageId: message._id, reactions }); }
  catch (error) { console.error(error); return res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/message/read', requireAuth, async (req, res) => {
  try { const conversation = await requireConversationMember(req.body.conversationId, req.auth.userId); if (!conversation) return res.status(403).json({ error: 'Conversation access denied.' }); await Messages.updateMany({ conversationId: toIdString(conversation._id), senderId: { $ne: req.auth.userId }, status: { $ne: 'read' } }, { $set: { status: 'read' } }); return res.status(200).json({ message: 'Messages marked as read' }); }
  catch (error) { console.error(error); return res.status(500).json({ error: 'Server error' }); }
});
app.get('/api/users/:userId', requireAuth, async (req, res) => {
  try { if (toIdString(req.params.userId) !== req.auth.userId) return res.status(403).json({ error: 'Unauthorized.' }); const users = await Users.find({ _id: { $ne: req.auth.userId }, emailVerified: true }).select('_id email fullName avatar lastSeen updatedAt'); return res.status(200).json(users.map((user) => ({ user: { email: user.email, fullName: user.fullName, receiverId: user._id, avatar: user.avatar || null, lastSeen: user.lastSeen || user.updatedAt || null } }))); }
  catch (error) { console.error(error); return res.status(500).json({ error: 'Server error' }); }
});

// ==========================================
// 404 & ERROR HANDLING MIDDLEWARE
// ==========================================

// Handle unmatched API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `API endpoint '${req.originalUrl}' not found.` });
});

// Centralized Express error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  const status = err.statusCode || err.status || 500;
  const message = process.env.NODE_ENV === 'production' && status === 500
    ? 'Internal server error.'
    : (err.message || 'Server error.');
  res.status(status).json({ error: message });
});

// Process-level unhandled rejection / exception guards
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

server.listen(port, () => console.log(`Listening on Port ${port}`));
