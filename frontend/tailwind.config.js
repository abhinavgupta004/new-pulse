/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#E9E4D6", // base background — dulled newsprint, not AI-cream
        card: "#F5F1E7", // slightly lifted surface for panels
        ink: "#1B2233", // primary text
        "ink-soft": "#4B5468", // secondary text / meta
        rule: "#C9C2AE", // hairline dividers
        wire: "#B0272D", // primary accent — wire-service red, used sparingly
        "wire-soft": "#D98E8B",
        signal: "#B08328", // secondary accent — used for intensity scaling
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "Georgia", "serif"],
        sans: ["var(--font-public-sans)", "system-ui", "sans-serif"],
      },
      fontSize: {
        masthead: ["3.25rem", { lineHeight: "1.05", letterSpacing: "-0.01em" }],
      },
    },
  },
  plugins: [],
};
