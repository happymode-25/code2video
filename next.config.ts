import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Remotion's renderer and bundler must run unbundled in the Node server.
  serverExternalPackages: ["@remotion/bundler", "@remotion/renderer"],

  // Tailwind 4 via the first-party Turbopack loader (no PostCSS config needed).
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
