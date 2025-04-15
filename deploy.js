require("dotenv").config();
const { NodeSSH } = require("node-ssh");
const path = require("path");

const ssh = new NodeSSH();

async function deploy() {
  try {
    console.log("开始部署...");

    // 连接服务器
    await ssh.connect({
      host: process.env.DEPLOY_HOST,
      username: process.env.DEPLOY_USERNAME,
      password: process.env.DEPLOY_PASSWORD,
      port: process.env.DEPLOY_PORT || 22,
    });

    console.log("已连接到服务器");

    // 获取项目根目录
    const projectRoot = path.resolve(__dirname);
    const remotePath = process.env.DEPLOY_PATH || "/var/www/nodeRed";

    // 清理远程目录（保留node_modules和.env文件）
    console.log("清理远程目录...");
    const cleanCommand = `
            cd ${remotePath} && \
            find . -maxdepth 1 ! -name '.' ! -name '..' ! -name 'node_modules' ! -name '.env' -exec rm -rf {} +
        `;
    await ssh.execCommand(cleanCommand);
    console.log("远程目录清理完成");

    // 上传项目文件
    console.log(`正在上传文件到 ${remotePath}...`);
    await ssh.putDirectory(projectRoot, remotePath, {
      recursive: true,
      concurrency: 10,
      validate: function (itemPath) {
        const baseName = path.basename(itemPath);
        return (
          baseName.charAt(0) !== "." && // 不上传隐藏文件
          baseName !== "node_modules"
        ); // 不上传node_modules
        //    baseName !== '.env';   不上传.env文件
      },
    });

    // 安装依赖（如果package.json有更新）
    console.log("检查并更新项目依赖...");
    await ssh.execCommand("npm install", {
      cwd: remotePath,
    });

    // 检查PM2是否已安装
    console.log("检查PM2...");
    const pmResult = await ssh.execCommand("pm2 -v");
    if (pmResult.code !== 0) {
      console.log("PM2未安装，正在安装...");
      await ssh.execCommand("npm install pm2 -g");
    } else {
      console.log("PM2已安装，版本：" + pmResult.stdout);
    }

    // 使用PM2启动应用
    console.log("使用PM2重启应用...");
    await ssh.execCommand("pm2 delete nodeRed || true", { cwd: remotePath });
    await ssh.execCommand("pm2 restart ecosystem.config.js --env production", {
      cwd: remotePath,
    });

    console.log("部署完成！");
    process.exit(0);
  } catch (error) {
    console.error("部署失败:", error);
    process.exit(1);
  } finally {
    ssh.dispose(); // 确保关闭连接
  }
}

deploy();
