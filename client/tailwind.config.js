/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#000000',
        'navy-surface': '#14213d',
        'navy-light': '#1d2d4f',
        // accent runtime-da branding rənginə görə dəyişir (index.css :root --accent-rgb).
        // RGB komponent formatı — opacity modifikatorları (accent/30, bg-accent/10) düzgün işləsin.
        accent: 'rgb(var(--accent-rgb, 252 163 17) / <alpha-value>)',
        'text-muted': '#9aa3b8',
        border: 'rgba(229, 229, 229, 0.1)',
      },
      fontFamily: {
        heading: ['Space Grotesk', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
