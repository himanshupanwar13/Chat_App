import React, { useState } from 'react';
import { API_BASE_URL } from '../../config';

export const getInitials = (name = '') => {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const GRADIENTS = [
  'from-violet-600 to-indigo-600',
  'from-blue-600 to-cyan-600',
  'from-emerald-600 to-teal-600',
  'from-rose-600 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-purple-600 to-fuchsia-600',
  'from-sky-600 to-blue-700',
];

export const getAvatarGradient = (name = '') => {
  let hash = 0;
  const str = String(name || '');
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
};

export const resolveAvatarUrl = (avatar) => {
  if (!avatar) return null;
  const rawUrl = typeof avatar === 'string' ? avatar : avatar?.url;
  if (!rawUrl) return null;
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://') || rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) {
    return rawUrl;
  }
  const base = API_BASE_URL.replace(/\/+$/, '');
  const cleanPath = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
  return `${base}${cleanPath}`;
};

const SIZE_CLASSES = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-11 w-11 text-sm',
  xl: 'h-14 w-14 text-lg',
  '2xl': 'h-20 w-20 text-2xl',
};

const DOT_SIZE_CLASSES = {
  xs: 'h-2 w-2 border',
  sm: 'h-2.5 w-2.5 border-2',
  md: 'h-3 w-3 border-2',
  lg: 'h-3 w-3 border-2',
  xl: 'h-3.5 w-3.5 border-2',
  '2xl': 'h-4 w-4 border-2',
};

const Avatar = ({
  src,
  name = 'User',
  size = 'md',
  className = '',
  onlineIndicator = false,
  isOnline = false,
  alt,
}) => {
  const [imageError, setImageError] = useState(false);
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md;
  const dotSizeClass = DOT_SIZE_CLASSES[size] || DOT_SIZE_CLASSES.md;
  const resolvedUrl = resolveAvatarUrl(src);
  const initials = getInitials(name);
  const gradient = getAvatarGradient(name);

  return (
    <div className={`relative flex-shrink-0 select-none ${className}`}>
      {resolvedUrl && !imageError ? (
        <img
          src={resolvedUrl}
          alt={alt || name || 'Avatar'}
          onError={() => setImageError(true)}
          className={`${sizeClass} rounded-full object-cover ring-1 ring-slate-200/80 dark:ring-slate-700/80`}
        />
      ) : (
        <div
          aria-label={name || 'Avatar'}
          className={`${sizeClass} flex items-center justify-center rounded-full bg-gradient-to-tr ${gradient} font-semibold text-white shadow-xs ring-1 ring-white/20`}
        >
          {initials}
        </div>
      )}

      {onlineIndicator && (
        <span
          className={`absolute bottom-0 right-0 ${dotSizeClass} rounded-full border-white dark:border-slate-800 ${
            isOnline ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
          }`}
          aria-hidden="true"
        />
      )}
    </div>
  );
};

export default Avatar;

