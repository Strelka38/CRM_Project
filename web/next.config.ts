import type { NextConfig } from "next";

/** Skip heavy typecheck inside Docker builds (do it locally / in CI). */
const isDockerBuild = process.env.DOCKER_BUILD === "1";
/** Cap workers on tiny VPS builds (2 vCPU) to cut thrashing / swap. */
const dockerCpus = Math.max(
  1,
  Number(process.env.DOCKER_BUILD_CPUS || 1) || 1,
);

const allowedDevOrigins = [
  "localhost",
  "127.0.0.1",
  ...(process.env.ALLOWED_DEV_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
];

const nextConfig: NextConfig = {
  output: "standalone",
  // LAN phone testing: Next 16 blocks unknown Host in dev (login POST / HMR).
  // Add current Wi‑Fi IP via ALLOWED_DEV_ORIGINS=192.168.0.101 in web/.env
  allowedDevOrigins,
  // Silence Next 16 Turbopack vs webpack-config conflict in `next dev`
  turbopack: {},
  typescript: {
    ignoreBuildErrors: isDockerBuild,
  },
  serverExternalPackages: [
    "@prisma/client",
    "prisma",
    "exceljs",
    "bcryptjs",
    "jspdf",
    "jspdf-autotable",
    "qrcode",
  ],
  experimental: {
    // JSON/catalog backups from prod are often > 10MB; truncated multipart
    // then fails as "Failed to parse body as FormData".
    proxyClientMaxBodySize: "50mb",
    ...(isDockerBuild
      ? {
          cpus: dockerCpus,
          webpackMemoryOptimizations: true,
        }
      : {}),
  },
  // Only for Docker `next build --webpack` — keep out of local Turbopack dev
  ...(isDockerBuild
    ? {
        webpack: (config: { parallelism?: number }) => {
          config.parallelism = dockerCpus;
          return config;
        },
      }
    : {}),
};

export default nextConfig;
