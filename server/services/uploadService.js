const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Readable } = require('stream');
const cloudinary = require('cloudinary').v2;

const ALLOWED_MIME_TYPES = {
  // Images
  'image/jpeg': { type: 'image', ext: ['.jpg', '.jpeg'] },
  'image/png': { type: 'image', ext: ['.png'] },
  'image/webp': { type: 'image', ext: ['.webp'] },
  'image/gif': { type: 'image', ext: ['.gif'] },
  // Documents
  'application/pdf': { type: 'file', ext: ['.pdf'] },
  'application/msword': { type: 'file', ext: ['.doc'] },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { type: 'file', ext: ['.docx'] },
  'application/vnd.ms-excel': { type: 'file', ext: ['.xls'] },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { type: 'file', ext: ['.xlsx'] },
  'application/vnd.ms-powerpoint': { type: 'file', ext: ['.ppt'] },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { type: 'file', ext: ['.pptx'] },
  'text/plain': { type: 'file', ext: ['.txt'] },
  'text/csv': { type: 'file', ext: ['.csv'] },
  'application/zip': { type: 'file', ext: ['.zip'] },
  'application/x-zip-compressed': { type: 'file', ext: ['.zip'] },
};

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_FILE_SIZE = 25 * 1024 * 1024;  // 25 MB

const isCloudinaryConfigured = () => {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
};

if (isCloudinaryConfigured()) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

function sanitizeFileName(originalName) {
  const base = path.basename(originalName || 'file');
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100);
}

function validateFile({ originalName, mimeType, size }) {
  const normalizedMime = String(mimeType || '').toLowerCase();
  const info = ALLOWED_MIME_TYPES[normalizedMime];

  if (!info) {
    return { valid: false, error: `File type '${mimeType}' is not supported.` };
  }

  const ext = path.extname(originalName || '').toLowerCase();
  if (!info.ext.includes(ext)) {
    return { valid: false, error: `File extension '${ext}' does not match content type '${mimeType}'.` };
  }

  const maxSize = info.type === 'image' ? MAX_IMAGE_SIZE : MAX_FILE_SIZE;
  if (size > maxSize) {
    const maxMb = maxSize / (1024 * 1024);
    return { valid: false, error: `File size exceeds the maximum allowed limit of ${maxMb} MB.` };
  }

  return { valid: true, type: info.type, ext };
}

async function uploadToCloudinary(buffer, options) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
    Readable.from(buffer).pipe(uploadStream);
  });
}

async function uploadToLocalStorage({ buffer, originalName, mimeType, type, conversationId }) {
  const uploadDir = path.join(__dirname, '..', 'uploads', conversationId || 'general');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const safeName = sanitizeFileName(originalName);
  const uniqueId = crypto.randomUUID();
  const storageFileName = `${uniqueId}-${safeName}`;
  const filePath = path.join(uploadDir, storageFileName);

  await fs.promises.writeFile(filePath, buffer);

  // Return relative URL for static serving
  const relativeUrl = `/uploads/${conversationId || 'general'}/${storageFileName}`;

  return {
    type,
    url: relativeUrl,
    publicId: null,
    fileName: safeName,
    mimeType,
    size: buffer.length,
    width: null,
    height: null,
  };
}

async function processAttachmentUpload({ buffer, originalName, mimeType, size, conversationId }) {
  const validation = validateFile({ originalName, mimeType, size });
  if (!validation.valid) {
    const err = new Error(validation.error);
    err.statusCode = 400;
    throw err;
  }

  const safeName = sanitizeFileName(originalName);

  if (isCloudinaryConfigured()) {
    const isImage = validation.type === 'image';
    const folder = `chatterflow/conversations/${conversationId || 'general'}`;

    const options = {
      folder,
      resource_type: isImage ? 'image' : 'raw',
      public_id: `${crypto.randomUUID()}_${path.parse(safeName).name}`,
      use_filename: false,
      unique_filename: true,
      overwrite: false,
    };

    const result = await uploadToCloudinary(buffer, options);

    return {
      type: validation.type,
      url: result.secure_url || result.url,
      publicId: result.public_id,
      fileName: safeName,
      mimeType,
      size: result.bytes || size,
      width: result.width || null,
      height: result.height || null,
    };
  }

  // If in production and Cloudinary credentials are not configured, reject the upload
  if (process.env.NODE_ENV === 'production') {
    const err = new Error('Cloud storage service (Cloudinary) is not configured on the server.');
    err.statusCode = 500;
    throw err;
  }

  // Fallback to local storage only in development / testing environments
  return uploadToLocalStorage({
    buffer,
    originalName: safeName,
    mimeType,
    type: validation.type,
    conversationId,
  });
}

const AVATAR_ALLOWED_MIME_TYPES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/gif': ['.gif'],
};
const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5 MB

function validateAvatarFile({ originalName, mimeType, size }) {
  const normalizedMime = String(mimeType || '').toLowerCase();
  const allowedExts = AVATAR_ALLOWED_MIME_TYPES[normalizedMime];

  if (!allowedExts) {
    return { valid: false, error: 'Avatar must be an image (JPEG, PNG, WebP, or GIF).' };
  }

  const ext = path.extname(originalName || '').toLowerCase();
  if (!allowedExts.includes(ext)) {
    return { valid: false, error: `File extension '${ext}' does not match content type '${mimeType}'.` };
  }

  if (size > MAX_AVATAR_SIZE) {
    return { valid: false, error: 'Image must be 5 MB or smaller.' };
  }

  return { valid: true };
}

async function deleteCloudinaryAsset(publicId, resourceType = 'image') {
  if (!publicId || !isCloudinaryConfigured()) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (error) {
    console.error('Cloudinary asset deletion error (non-fatal):', error);
  }
}

async function processAvatarUpload({ buffer, originalName, mimeType, size, userId }) {
  const validation = validateAvatarFile({ originalName, mimeType, size });
  if (!validation.valid) {
    const err = new Error(validation.error);
    err.statusCode = 400;
    throw err;
  }

  const safeName = sanitizeFileName(originalName);

  if (isCloudinaryConfigured()) {
    const folder = `chatterflow/avatars/${userId || 'general'}`;
    const options = {
      folder,
      resource_type: 'image',
      public_id: `${crypto.randomUUID()}_${path.parse(safeName).name}`,
      use_filename: false,
      unique_filename: true,
      overwrite: false,
    };

    const result = await uploadToCloudinary(buffer, options);

    return {
      url: result.secure_url || result.url,
      publicId: result.public_id,
    };
  }

  if (process.env.NODE_ENV === 'production') {
    const err = new Error('Cloud storage service (Cloudinary) is not configured on the server.');
    err.statusCode = 500;
    throw err;
  }

  // Fallback to local storage in development
  const uploadDir = path.join(__dirname, '..', 'uploads', 'avatars', userId || 'general');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const uniqueId = crypto.randomUUID();
  const storageFileName = `${uniqueId}-${safeName}`;
  const filePath = path.join(uploadDir, storageFileName);

  await fs.promises.writeFile(filePath, buffer);

  return {
    url: `/uploads/avatars/${userId || 'general'}/${storageFileName}`,
    publicId: null,
  };
}

module.exports = {
  validateFile,
  processAttachmentUpload,
  validateAvatarFile,
  processAvatarUpload,
  deleteCloudinaryAsset,
  sanitizeFileName,
  ALLOWED_MIME_TYPES,
  AVATAR_ALLOWED_MIME_TYPES,
  MAX_IMAGE_SIZE,
  MAX_FILE_SIZE,
  MAX_AVATAR_SIZE,
};
