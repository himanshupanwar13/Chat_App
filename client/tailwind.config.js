/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        'primary' : "#1476ff"
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}