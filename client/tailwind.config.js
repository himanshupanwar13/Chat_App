/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./src/**/*.{html,js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        primary: '#7c3aed',
        shell: '#f5f3ff',
        panel: '#ffffff',
        'panel-soft': '#f8fafc',
      },
      boxShadow: {
        soft: '0 20px 45px -18px rgba(124, 58, 237, 0.35)',
        panel: '0 10px 30px rgba(15, 23, 42, 0.08)',
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.2s ease-out',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}