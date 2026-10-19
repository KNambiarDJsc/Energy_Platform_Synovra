/** @type {import('next').NextConfig} */
const nextConfig = {
  // The container image sets NEXT_OUTPUT=standalone to ship only what the server needs. Normal builds are unchanged.
  ...(process.env.NEXT_OUTPUT === 'standalone' ? { output: 'standalone' } : {}),
  reactStrictMode: true,
  poweredByHeader: false,
  // End-to-end runs build into their own folder so they never collide with a running `next dev`.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Do not write AGENTS.md / CLAUDE.md into the repository on `next dev`.
  agentRules: false,
};
export default nextConfig;
