/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './*.html',
    './admin/*.html',
    './assets/js/*.js',
    './admin/js/*.js',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  corePlugins: {
    preflight: true,
  },
};
