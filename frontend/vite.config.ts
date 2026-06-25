import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Slice 1 scaffold. Vitest runs in a node env -- the core math is pure and
// dependency-free, so no DOM is required for the parity tests (D25 anchors).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
  },
});
