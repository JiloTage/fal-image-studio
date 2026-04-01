import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "..", "");
  return {
    plugins: [react()],
    base: "/fal-image-studio/",
    define: {
      "import.meta.env.VITE_FAL_KEY": JSON.stringify(env.FAL_KEY || ""),
    },
    build: {
      outDir: "dist",
    },
  };
});
