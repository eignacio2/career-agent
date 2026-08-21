import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keeps Next from regenerating AGENTS.md and CLAUDE.md on every dev start.
  agentRules: false,
};

export default nextConfig;
