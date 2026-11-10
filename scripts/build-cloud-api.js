// 把 server/src 同步到云函数目录，保证云端与 Koa 版共用同一份业务代码。
// 用法：node scripts/build-cloud-api.js
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'server', 'src');
const target = path.join(root, 'miniprogram', 'cloudfunctions', 'api', 'src');

// Koa 常驻服务的入口在云函数环境下不适用，避免误引入后启动监听。
const EXCLUDED_ENTRY_FILES = ['app.js', 'migrate.js', 'sync.js'];

if (!fs.existsSync(source)) {
  console.error('未找到 server/src，无法生成云函数代码');
  process.exit(1);
}

fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });

EXCLUDED_ENTRY_FILES.forEach(function (name) {
  const file = path.join(target, name);
  if (fs.existsSync(file)) fs.rmSync(file);
});

console.log('云函数代码已生成：' + path.relative(root, target));

// 递归列出目录下的所有文件，返回相对路径（统一使用 /）。
function listFiles(dir, prefix) {
  const result = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
    const relative = prefix ? prefix + '/' + entry.name : entry.name;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push.apply(result, listFiles(absolute, relative));
    } else if (entry.isFile()) {
      result.push(relative);
    }
  });
  return result;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

// 只校验应该保持一致的文件：排除云函数入口中不使用的 Koa 入口文件。
const expectedFiles = listFiles(source, '').filter(function (relative) {
  return !(relative.indexOf('/') === -1 && EXCLUDED_ENTRY_FILES.indexOf(relative) !== -1);
});

const missing = [];
const mismatched = [];

expectedFiles.forEach(function (relative) {
  const sourceFile = path.join(source, relative);
  const targetFile = path.join(target, relative);
  if (!fs.existsSync(targetFile)) {
    missing.push(relative);
    return;
  }
  const sourceHash = sha256(sourceFile);
  const targetHash = sha256(targetFile);
  if (sourceHash !== targetHash) {
    mismatched.push(relative + '（源 ' + sourceHash.slice(0, 12) + '，生成 ' + targetHash.slice(0, 12) + '）');
  }
});

if (missing.length || mismatched.length) {
  if (missing.length) {
    console.error('缺失文件（' + missing.length + '）：');
    missing.forEach(function (relative) {
      console.error('  - ' + relative);
    });
  }
  if (mismatched.length) {
    console.error('内容不一致（' + mismatched.length + '）：');
    mismatched.forEach(function (relative) {
      console.error('  - ' + relative);
    });
  }
  console.error('一致性校验失败：请重新运行本脚本生成云函数代码');
  process.exit(1);
}

console.log('一致性校验通过：' + expectedFiles.length + ' 个文件');

console.log('');
console.log('部署步骤：');
console.log('  1. 在微信开发者工具中右键 cloudfunctions/api → 上传并部署（云端安装依赖）');
console.log('  2. 云函数环境变量建议：DB_POOL_MAX=3、DB_ACQUIRE_MS=5000');
console.log('  3. 部署前先执行数据库迁移：npm run migrate、npm run indexes、npm run migrate:request-keys、npm run migrate:statement-expiry');
console.log('  4. 轮换已泄露的凭据：TiDB 密码、WX_SECRET、JWT_SECRET（JWT_SECRET 至少 32 位）');
