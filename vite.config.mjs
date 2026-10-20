// Root hosting stays unchanged unless the dedicated GitHub Pages build opts in.
export default {
  base: process.env.DEPLOY_TARGET==='github-pages'?'/korean-card-game/':'/',
  publicDir: 'public',
  resolve: {
    // Also permits building from managed/symlinked local workspaces.
    preserveSymlinks: true,
  },
  build: {
    outDir: 'dist',
  },
};
