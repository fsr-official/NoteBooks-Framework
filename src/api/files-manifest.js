"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildLocalFilesManifest = buildLocalFilesManifest;
exports.writeFilesJson = writeFilesJson;
const promises_1 = require("fs/promises");
const path_1 = __importDefault(require("path"));
const EXCLUDED_DIRS = new Set(['.git', '.github', 'node_modules', '.vercel', 'tmp']);
const SUPPORTED_EXTENSIONS = new Set([
    'md', 'markdown', 'txt', 'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx',
    'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'mp3', 'wav', 'ogg', 'mp4', 'webm',
    'json', 'html', 'htm', 'css', 'js', 'ts', 'py', 'csv'
]);
function normalizePath(input) {
    return input.replace(/^\/+|\/+$/g, '').replace(/\\/g, '/');
}
async function walkDirectory(baseDir, relDir = '') {
    const entries = await (0, promises_1.readdir)(path_1.default.join(baseDir, relDir), { withFileTypes: true });
    const nodes = [];
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.isDirectory()) {
            if (EXCLUDED_DIRS.has(entry.name))
                continue;
            const childRelDir = relDir ? path_1.default.join(relDir, entry.name) : entry.name;
            const childNodes = await walkDirectory(baseDir, childRelDir);
            if (childNodes.length > 0) {
                nodes.push({
                    type: 'folder',
                    name: entry.name,
                    path: normalizePath(childRelDir),
                    children: childNodes
                });
            }
        }
        else if (entry.isFile()) {
            const ext = path_1.default.extname(entry.name).slice(1).toLowerCase();
            if (SUPPORTED_EXTENSIONS.has(ext) || !path_1.default.extname(entry.name)) {
                const childRelPath = relDir ? path_1.default.join(relDir, entry.name) : entry.name;
                nodes.push({
                    type: 'file',
                    name: entry.name,
                    path: normalizePath(childRelPath)
                });
            }
        }
    }
    return nodes;
}
async function buildLocalFilesManifest(rootDir) {
    const resolvedRoot = path_1.default.resolve(rootDir);
    const children = await walkDirectory(resolvedRoot);
    return {
        type: 'folder',
        name: path_1.default.basename(resolvedRoot) || 'root',
        path: '',
        children
    };
}
async function writeFilesJson(rootDir, outputPath) {
    const manifest = await buildLocalFilesManifest(rootDir);
    await (0, promises_1.readFile)(outputPath, 'utf8').catch(() => undefined);
    const { writeFile } = await import('fs/promises');
    await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
