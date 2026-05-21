/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        forest: '#1a3a2a',
        'forest-light': '#2d5a3d',
        cream: '#f5f0e8',
        gold: '#c9a84c',
      },
    },
  },
  plugins: [],
}
