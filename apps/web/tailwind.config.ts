import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bondexos: {
          ink: "#111827",
          muted: "#64748b",
          line: "#dbe3ef",
          accent: "#0f766e"
        }
      }
    }
  },
  plugins: []
};

export default config;
