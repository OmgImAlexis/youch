import concat from 'concat';
import { minify } from 'uglify-js';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { mkdir } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const INPUT = join(__dirname, '..', 'static');
const OUTPUT = join(__dirname, '..', 'dist');

/**
 * Js files to concat and uglify. Define them in the correct order.
 */
const jsFiles = [
  'zepto.js',
  'prism.js',
  'app.js'
].map(file => join(INPUT, file))

/**
 * Css files to compile and uglify.
 */
const cssFiles = [
  'prism.css',
  'magic-checkbox.css',
  'app.css'
].map(file => join(INPUT, file))

/**
 * Base template source. Must be a mustache template.
 */
const templateSource = readFileSync(join(INPUT, 'error.mustache'), 'utf-8');

/**
 * Bundle js files by concatenating them and then uglifying them.
 */
const bundleJsFiles = async () => {
  const output = await concat(jsFiles);
  const uglified = minify(output);
  if (uglified.error) throw new Error(uglified.error);
  return uglified.code;
};

/**
 * Bundle css files by concatenating them and minifying them via css nano.
 */
const bundleCssFiles = () => concat(cssFiles);

(async function () {
  try {
    await mkdir(OUTPUT, { recursive: true });
    const js = await bundleJsFiles();
    const css = await bundleCssFiles();
    const content = templateSource.replace(/\[\[__js__\]\]/, () => js).replace(/\[\[__css__\]\]/, css);
    writeFileSync(join(OUTPUT, 'error.compiled.mustache'), content);
    console.log('Bundle created');
  } catch (error) {
    console.log('Unable to bundle files, due to following error');
    console.log(error);
    process.exit(1);    
  }
})();
