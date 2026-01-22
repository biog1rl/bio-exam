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
  const rootDir = path.resolve(__dirname, '../..');

  console.log('Installing dependencies...');
  run('yarn install', rootDir);

  console.log('Building @bio-exam/rbac...');
  run('yarn workspace @bio-exam/rbac build', rootDir);

  console.log('Building server...');
  run('yarn build', __dirname);

  console.log('Build completed successfully!');
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}
