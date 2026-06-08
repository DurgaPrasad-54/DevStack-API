module.exports = {
  apps: [
    {
      name: 'devstack-backend',
      script: './server.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      watch: false,
      max_memory_restart: '500M',
      graceful_shutdown: true,
      shutdown_timeout: 5000,
      listen_timeout: 3000,
      kill_timeout: 5000,
      wait_ready: true,
      max_restarts: 10,
      min_uptime: '10s',
      cron_restart: '0 2 * * *', // Restart daily at 2 AM
      autorestart: true,
      vizion: true,
      monitor_interval: 5000,
      instance_var: 'INSTANCE_ID',
    },
  ],

  deploy: {
    production: {
      user: 'node',
      host: 'your-production-host.com',
      ref: 'origin/main',
      repo: 'your-repo-url.git',
      path: '/var/www/devstack-backend',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-deploy-local': 'echo "Deployment started"',
      env: {
        NODE_ENV: 'production',
      },
    },
  },
};
