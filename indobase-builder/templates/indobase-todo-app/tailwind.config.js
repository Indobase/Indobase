/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff4ed',
          500: '#e84718',
          600: '#c93a12',
          950: '#3a1207',
        },
      },
    },
  },
  plugins: [],
};
