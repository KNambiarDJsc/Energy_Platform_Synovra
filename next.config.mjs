/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // End-to-end runs build into their own folder so they never collide with a running `next dev`.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Do not write AGENTS.md / CLAUDE.md into the repository on `next dev`.
  agentRules: false,
};
export default nextConfig;
