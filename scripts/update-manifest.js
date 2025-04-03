import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = new URL('.', import.meta.url).pathname;

// Read the manifest file
const manifestPath = join(__dirname, '../dist/manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

// Update the popup path for production
manifest.action.default_popup = 'popup.html';

// Write the updated manifest back
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log('Updated manifest.json for production'); 