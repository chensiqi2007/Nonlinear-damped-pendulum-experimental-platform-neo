import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = path.join(projectDirectory, 'api');
const targetDirectory = path.join(projectDirectory, 'dist', 'api');

await fs.rm(targetDirectory, { recursive: true, force: true });
await fs.cp(sourceDirectory, targetDirectory, { recursive: true });
await fs.writeFile(path.join(projectDirectory, 'dist', '.htaccess'), 'Options -Indexes\n\n<FilesMatch "^\\.env">\n  Order allow,deny\n  Deny from all\n</FilesMatch>\n');
