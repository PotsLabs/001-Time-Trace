import { readFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

const svgText = readFileSync(resolve(projectRoot, 'public/Pots-Full.svg'), 'utf8');
const match = svgText.match(/xlink:href="data:image\/png;base64,([^"]+)"/);
if (!match) throw new Error('Could not find embedded base64 PNG in Pots-Full.svg');
const pngBuffer = Buffer.from(match[1], 'base64');

const FIT_SIZE = 820;
const CANVAS_SIZE = 1024;

const { data: resizedBuffer, info } = await sharp(pngBuffer)
  .resize(FIT_SIZE, FIT_SIZE, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer({ resolveWithObject: true });

const padH = Math.floor((CANVAS_SIZE - info.width) / 2);
const padV = Math.floor((CANVAS_SIZE - info.height) / 2);

mkdirSync(resolve(projectRoot, 'build'), { recursive: true });

await sharp(resizedBuffer)
  .extend({
    top: padV,
    bottom: CANVAS_SIZE - info.height - padV,
    left: padH,
    right: CANVAS_SIZE - info.width - padH,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toFile(resolve(projectRoot, 'build/icon.png'));

console.log(`✓ Icon generated → build/icon.png (${CANVAS_SIZE}×${CANVAS_SIZE})`);
