/**
 * 同步版本号脚本
 * 将 version.ts 中的版本号同步到 package.json
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 读取版本号
const versionFile = join(__dirname, '..', 'version.ts');
const versionContent = readFileSync(versionFile, 'utf-8');
const versionMatch = versionContent.match(/export const VERSION = "(.+)"/);

if (!versionMatch) {
  console.error('❌ 无法从 version.ts 读取版本号');
  process.exit(1);
}

const version = versionMatch[1];
console.log(`📦 检测到版本号: ${version}`);

// 更新 package.json
const packageJsonPath = join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
const oldVersion = packageJson.version;

if (oldVersion === version) {
  console.log('✅ package.json 版本号已是最新');
} else {
  packageJson.version = version;
  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  console.log(`✅ 已更新 package.json 版本号: ${oldVersion} → ${version}`);
}
