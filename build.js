import { mkdir, copyFile } from 'node:fs/promises';

// Only browser assets belong in the Vercel deployment.
const files = ['index.html', 'style.css', 'app.js', 'firebase-config.js', 'pagination.js'];
await mkdir(new URL('./dist/', import.meta.url), { recursive: true });
await Promise.all(files.map(file => copyFile(
  new URL(file, import.meta.url), new URL(`dist/${file}`, import.meta.url)
)));
console.log(`Static site built: ${files.length} files in dist/`);
