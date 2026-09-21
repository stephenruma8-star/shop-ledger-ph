/** Shop Ledger PH — production Tailwind build (replaces the dev Play CDN).
 * Regenerate: npm run css
 * @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/renderer/**/*.html', './src/renderer/js/**/*.js'],
  theme: {
    extend: {
      colors: {
        phblue: { 50: '#eff6ff', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8' }
      }
    }
  },
};
