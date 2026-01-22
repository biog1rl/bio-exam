const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const lockFile = path.join(__dirname, '.vercel-build.lock');

// Проверяем, не запущена ли уже сборка
if (fs.existsSync(lockFile)) {
  console.log('Build already in progress or completed, skipping...');
  process.exit(0);
}

// Создаем lock файл
fs.writeFileSync(lockFile, Date.now().toString());

function run(cmd) {
  console.log(`Running: ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

try {
  console.log('Building @bio-exam/rbac...');
  run('yarn workspace @bio-exam/rbac build');

  console.log('Building @bio-exam/server...');
  run('yarn workspace @bio-exam/server build');

  console.log('Build completed successfully!');
} catch (error) {
  console.error('Build failed:', error.message);
  fs.unlinkSync(lockFile);
  process.exit(1);
}
