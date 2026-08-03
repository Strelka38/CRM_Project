import type { NextConfig } from "next";

/** Skip heavy typecheck inside Docker builds (do it locally / in CI). */
const isDockerBuild = process.env.DOCKER_BUILD === "1";
/** Cap workers on tiny VPS builds (2 vCPU) to cut thrashing / swap. */
const dockerCpus = Math.max(
  1,
  Number(process.env.DOCKER_BUILD_CPUS || 1) || 1,
);

const nextConfig: NextConfig = {
  output: "standalone",
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
  ],
  experimental: {
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
