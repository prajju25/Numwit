/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,js,jsx}", "./public/**/*.html"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'Plus Jakarta Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        numwit: {
          violet:  '#7C3AED',
          cyan:    '#06B6D4',
          success: '#10B981',
          danger:  '#EF4444',
          warning: '#F59E0B',
          deep:    '#1a1a2e',
          mid:     '#16213e',
          surface: '#0f3460',
        },
      },
      backgroundImage: {
        'numwit-gradient': 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        'violet-gradient': 'linear-gradient(to right, #7C3AED, #8B5CF6)',
        'cyan-gradient':   'linear-gradient(to right, #06B6D4, #22D3EE)',
        'gold-gradient':   'linear-gradient(to right, #F59E0B, #FBBF24)',
      },
      boxShadow: {
        'violet-glow': '0 4px 24px rgba(124, 58, 237, 0.35)',
        'cyan-glow':   '0 4px 24px rgba(6, 182, 212, 0.35)',
        'glass':       '0 8px 32px rgba(0, 0, 0, 0.3)',
      },
    },
  },
  plugins: [],
};
