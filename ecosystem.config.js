module.exports = {
  apps: [{
    name: 'nodeRed',
    script: './bin/www',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: 'logs/error.log',
    out_file: 'logs/out.log',
    merge_logs: true,
    log_type: 'json',
    env: { NODE_ENV: "development" }, // 默认环境变量
    env_production: { NODE_ENV: "production" } // 生产环境变量
  }]
}