import type { NextConfig } from "next";

/** Skip heavy typecheck inside Docker builds (do it locally / in CI). */
const isDockerBuild = process.env.DOCKER_BUILD === "1";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: isDockerBuild,
  },
};

export default nextConfig;
