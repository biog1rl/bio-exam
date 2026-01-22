const { execSync } = require('child_process');
const path = require('path');

function run(cmd, cwd) {
  console.log(`Running: ${cmd} in ${cwd || process.cwd()}`);
  execSync(cmd, {
    cwd: cwd || process.cwd(),
    stdio: 'inherit',
    env: { ...process.env }
  });
}

try {
  // Скрипт запускается из корня репо через: node app/server/vercel-build.cjs
  const rootDir = process.cwd();
  const serverDir = path.join(rootDir, 'app/server');

  console.log('Root directory:', rootDir);
  console.log('Server directory:', serverDir);

  console.log('Building @bio-exam/rbac...');
  run('yarn workspace @bio-exam/rbac build', rootDir);

  console.log('Building server...');
  run('yarn workspace @bio-exam/server build', rootDir);

  console.log('Build completed successfully!');
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}
