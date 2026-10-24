const processSuffix = process.env.PEPSA_PM2_ENV === 'staging' ? '-staging' : '';
const defaultPort = process.env.PEPSA_PM2_ENV === 'staging' ? 3600 : 3610;
const port = Number(process.env.PORT || defaultPort);
const baseDir =
  process.env.PEPSA_PM2_ENV === 'staging'
    ? '/home/pepsa/var/www/vendor-server-staging'
    : '/home/pepsa/var/www/vendor-server-production';

module.exports = {
  apps: [
    {
      name: 'pepsa-vendor-api' + processSuffix,
      script: 'dist/main.js',
      cwd: baseDir,
      exec_mode: 'fork',
      instances: 1,
      max_memory_restart: '512M',
      kill_timeout: 15000,
      autorestart: true,
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: 'production',
        PORT: port,
      },
    },
  ],
};
