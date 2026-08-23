// PM2 — always ONE instance (shared SQLite + qol-store.json).
//
//   pm2 start ecosystem.config.js
//   pm2 logs goal-bound
//   pm2 restart goal-bound
//
module.exports = {
  apps: [
    {
      name: 'goal-bound',
      script: 'index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      min_uptime: '10s',
      restart_delay: 3000,
      max_restarts: 15,
      exp_backoff_restart_delay: 200,
      max_memory_restart: '500M',
      kill_timeout: 8000,
      listen_timeout: 10000,
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      merge_logs: true,
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
