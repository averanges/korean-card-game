Original PNG artwork retained for editing. These files are outside `public/` and are not copied into the Pages build.

The runtime uses WebP files in `public/assets/`. The table has a 960px mobile variant; the original desktop composition is retained. SVG frames remain vectors. No external image service or font download is required.

To regenerate the checked-in runtime artwork, use `node scripts/optimize-artwork.mjs` with an existing Sharp installation (`SHARP_MODULE` may specify its module URL). This optional tool is not a build step and does not require changing application dependencies.
