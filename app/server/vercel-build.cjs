const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function run(cmd, cwd) {
  console.log(`\n>>> Running: ${cmd}`);
  console.log(`>>> CWD: ${cwd}`);
  execSync(cmd, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env }
  });
}

try {
  const serverDir = process.cwd();
  console.log('Current directory (serverDir):', serverDir);

  // Ищем корень репозитория по наличию package.json с workspaces
  let rootDir = serverDir;
  for (let i = 0; i < 5; i++) {
    const parentDir = path.dirname(rootDir);
    const pkgPath = path.join(parentDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.workspaces) {
        rootDir = parentDir;
        break;
      }
    }
    rootDir = parentDir;
  }

  console.log('Root directory:', rootDir);
  console.log('Root package.json exists:', fs.existsSync(path.join(rootDir, 'package.json')));
  console.log('packages/rbac exists:', fs.existsSync(path.join(rootDir, 'packages/rbac')));
  console.log('packages/rbac/src/index.ts exists:', fs.existsSync(path.join(rootDir, 'packages/rbac/src/index.ts')));

  console.log('\n=== Building @bio-exam/rbac ===');
  run('yarn workspace @bio-exam/rbac build', rootDir);

  console.log('\n=== Building @bio-exam/server ===');
  run('yarn workspace @bio-exam/server build', rootDir);

  console.log('\n=== Build completed successfully! ===');
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}
