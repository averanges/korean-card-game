// Optional offline authoring tool. Its output is checked in; Pages builds need no image library.
// SHARP_MODULE may point to an existing tooling installation of sharp.
import {mkdir} from 'node:fs/promises';
const {default:sharp}=await import(process.env.SHARP_MODULE||'sharp');
const widths={table:1648,'approved-header':2048,'button-reference':1536,'card-back':640,'card-frame':768,'magic-cards':1536,'ghost-thief':768,'magicians-hat':768,'monkey-prank':768,'trick-gift':768};
await mkdir('public/assets',{recursive:true});
for(const [name,width] of Object.entries(widths))await sharp(`design/source-assets/${name}.png`).resize({width,withoutEnlargement:true}).webp({quality:name==='button-reference'?90:88,alphaQuality:100,effort:6}).toFile(`public/assets/${name}.webp`);
await sharp('design/source-assets/table.png').resize({width:960,withoutEnlargement:true}).webp({quality:85,alphaQuality:100,effort:6}).toFile('public/assets/table-mobile.webp');
