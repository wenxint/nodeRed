const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const cron = require('node-cron');

/**
 * @description 检查并执行 SVN 同步：首次执行 checkout，后续执行 update，降低网络和服务器压力
 * @see http://tc-svn.tencent.com/KungfuTeam/Red_proj/trunk/RedApp/Content/Script/Red/Net/Proto
 */
function syncProtoFromSVN() {
  const protoSVNRepo = 'http://tc-svn.tencent.com/KungfuTeam/Red_proj/trunk/RedApp/Content/Script/Red/Net/Proto';
  const protoDir = path.join(__dirname, '..', 'Proto');

  // 检查 svn 客户端是否可用
  let svnAvailable = true;
  try {
    execSync('svn --version', { stdio: 'ignore' });
  } catch (err) {
    svnAvailable = false;
  }
  if (!svnAvailable) {
    console.warn('未检测到 svn 客户端，跳过 Proto 文件同步');
    return;
  }

  try {
    // 删除本地 Proto 目录，确保全量刷新
    if (fs.existsSync(protoDir)) {
      fs.rmSync(protoDir, { recursive: true, force: true });
    }
    console.info('SVN 全量检出 Proto 文件...');
    execSync(
      `svn checkout "${protoSVNRepo}" "${protoDir}" --username a1_red --password A1Red@dev --no-auth-cache --non-interactive --trust-server-cert`,
      { stdio: 'inherit' }
    );
  } catch (error) {
    console.error('Proto 文件全量检出失败:', error);
  }
}

/**
 * @description 配置每日12:00定时同步Proto文件
 */
cron.schedule('0 12 * * *', () => {
  console.info('定时任务：开始执行Proto文件同步');
  syncProtoFromSVN();
}, {
  timezone: 'Asia/Shanghai'
});

module.exports = { syncProtoFromSVN };