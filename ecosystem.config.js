module.exports = {
  apps: [
    {
      name: "nodeRed",
      script: "./bin/www",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "logs/error.log",
      out_file: "logs/out.log",
      merge_logs: true,
      log_type: "json",
      time: true,
      timestamp: true,
      env_production: {
        PORT: 3000,
        NODE_ENV: "production",
        DEEPSEEK_API_BASE_URL: "https://api.deepseek.com",
        DEEPSEEK_API_KEY: "sk-bddeb7647c284c31a86f2e291701f86a"
      },
      // env: { NODE_ENV: "development" }, // 默认环境变量
      // env_production: { NODE_ENV: "production" } // 生产环境变量
    },
  ],
};
