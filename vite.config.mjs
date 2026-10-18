// Static hosting at the root of a Cloudflare Pages domain.
export default {
  base: '/',
  publicDir: 'public',
  resolve: {
    // Also permits building from managed/symlinked local workspaces.
    preserveSymlinks: true,
  },
  build: {
    outDir: 'dist',
  },
};
