/**
 * @file 日志文件处理和解压通用工具
 * @description 提供RedLog文件处理相关的公共函数
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const AdmZip = require('adm-zip');
const { spawn } = require('child_process');

/**
 * 解压RED日志文件
 * @param {string} logFilePath - 日志文件路径
 * @param {boolean} returnContent - 是否返回文件内容
 * @returns {Promise<string|{filePath: string, content: Buffer}>} - 解析为解压后的文件路径或对象
 */
async function decompressRedLog(logFilePath, returnContent = false) {
  // Python脚本路径
  const pythonScriptPath = path.join(__dirname, '../static/RedLogDecompress/RedLogDecompress.py');

  // 确保Python脚本存在
  if (!fs.existsSync(pythonScriptPath)) {
    throw new Error('Python脚本文件不存在');
  }

  console.log(`执行Python脚本: ${pythonScriptPath}`);
  console.log(`处理日志文件: ${logFilePath}`);

  // 在Windows上使用python，在Linux上使用python3
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

  // 执行Python脚本
  const python = spawn(pythonCmd, [pythonScriptPath, logFilePath], {
    shell: true,
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      LD_LIBRARY_PATH: path.join(__dirname, '../static/RedLogDecompress')
    }
  });

  let stdOutput = '';
  let errorOutput = '';

  // 设置超时时间（2分钟）
  const TIMEOUT = 2 * 60 * 1000;
  let timeoutId;

  // 收集标准输出
  python.stdout.on('data', (data) => {
    const output = data.toString('utf-8');
    stdOutput += output;
    output.split('\n').forEach(line => {
      if (line.trim()) console.log(`[Python输出] ${line}`);
    });
  });

  // 收集错误输出
  python.stderr.on('data', (data) => {
    const error = data.toString('utf-8');
    errorOutput += error;
    error.split('\n').forEach(line => {
      if (line.trim()) console.error(`[Python错误] ${line}`);
    });
  });

  // 等待Python脚本执行完成
  await new Promise((resolve, reject) => {
    // 设置超时处理
    timeoutId = setTimeout(() => {
      // 杀死进程
      python.kill();
      reject(new Error('Python脚本执行超时'));
    }, TIMEOUT);

    python.on('close', (code) => {
      clearTimeout(timeoutId);
      console.log(`Python脚本退出码: ${code}`);
      if (code !== 0) {
        reject(new Error(`Python脚本执行失败，退出码: ${code}\n${errorOutput}`));
      } else {
        console.log(`Python脚本执行完成`);
        resolve();
      }
    });

    // 添加错误处理
    python.on('error', (err) => {
      clearTimeout(timeoutId);
      console.error(`启动Python进程失败: ${err}`);
      reject(new Error(`启动Python进程失败: ${err.message}`));
    });
  }).finally(() => {
    // 确保进程被清理
    if (!python.killed) {
      python.kill();
    }
  });

  // 获取解压后的文件路径
  let decompressedFilePath;
  if (logFilePath.endsWith('.log')) {
    decompressedFilePath = logFilePath.replace('.log', 'Decompressed.log');
  } else if (logFilePath.endsWith('.redlog')) {
    decompressedFilePath = logFilePath.replace('.redlog', 'Decompressed.redlog');
  } else {
    // 默认情况，添加Decompressed后缀
    decompressedFilePath = logFilePath + 'Decompressed';
  }

  // 检查解压后的文件是否存在
  if (!fs.existsSync(decompressedFilePath)) {
    throw new Error(`解压后的文件不存在: ${decompressedFilePath}`);
  }

  // 如果需要返回文件内容
  if (returnContent) {
    // 读取解压后的文件内容
    const content = fs.readFileSync(decompressedFilePath);
    return {
      filePath: decompressedFilePath,
      content: content
    };
  }

  // 否则只返回文件路径
  return decompressedFilePath;
}

/**
 * 下载并解压特定OpenId的日志文件
 * @param {string} openId - 用户openId
 * @param {boolean} forceRedownload - 是否强制重新下载，即使目录已存在
 * @returns {Promise<string>} - 解析为解压目录路径
 */
async function downloadAndExtractZip(openId, forceRedownload = false) {
  // 日志文件的URL
  const logUrl = `http://diagnose.test.red.woa.com/Logstore/${openId}/`;
  console.log(`准备从URL下载文件: ${logUrl}`);

  // 临时文件存储路径
  const tempDir = path.join(__dirname, '../temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const zipFileName = `UserLog${openId}.zip`;
  const zipFilePath = path.join(tempDir, zipFileName);

  // 检查解压目录是否已存在
  const extractDir = path.join(tempDir, `UserLog_${openId}`);
  if (fs.existsSync(extractDir) && !forceRedownload) {
    console.log(`解压目录已存在: ${extractDir}`);
    return extractDir; // 如果目录已存在且不强制重新下载，直接返回
  }

  // 如果强制重新下载，先删除已存在的目录
  if (fs.existsSync(extractDir) && forceRedownload) {
    await new Promise((resolve, reject) => {
      fs.rm(extractDir, { recursive: true, force: true }, (err) => {
        if (err) {
          console.error(`删除目录失败: ${err.message}`);
          reject(err);
        } else {
          console.log(`成功删除已存在的目录: ${extractDir}`);
          resolve();
        }
      });
    });
  }

  try {
    // 发送请求获取日志文件
    const response = await axios({
      method: 'get',
      url: logUrl,
      responseType: 'stream'
    });

    // 将响应流写入文件
    const writer = fs.createWriteStream(zipFilePath);
    response.data.pipe(writer);

    // 等待文件写入完成
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    console.log(`ZIP文件已保存到: ${zipFilePath}`);

    // 创建解压目录
    fs.mkdirSync(extractDir, { recursive: true });

    // 解压ZIP文件
    const zip = new AdmZip(zipFilePath);
    zip.extractAllTo(extractDir, true);

    console.log(`ZIP文件已成功解压到: ${extractDir}`);

    // 清理ZIP文件
    fs.unlinkSync(zipFilePath);

    return extractDir;
  } catch (error) {
    console.log(error,'error22555');
    console.error(`下载或解压ZIP文件失败: ${error.message}`);

    // 清理可能存在的部分文件
    if (fs.existsSync(zipFilePath)) {
      fs.unlinkSync(zipFilePath);
    }

    throw error;
  }
}

/**
 * 查找目录中所有的.redlog文件
 * @param {string} dirPath - 要查找的目录路径
 * @param {string} basePath - 用于计算相对路径的基础路径
 * @returns {Array<{dir: string, file: string}>} - redlog文件数组
 */
function findRedlogFiles(dirPath, basePath) {
  const result = [];

  function searchDir(currentPath) {
    const items = fs.readdirSync(currentPath);
    for (const item of items) {
      const itemPath = path.join(currentPath, item);
      const stats = fs.statSync(itemPath);

      if (stats.isDirectory()) {
        // 如果是目录，递归查找
        searchDir(itemPath);
      } else if (item.endsWith('.redlog')) {
        // 找到.redlog文件，添加到结果数组
        const relativePath = path.relative(basePath, currentPath);
        const dir = relativePath ? relativePath : '.';
        result.push({
          dir: dir,
          file: item
        });
      }
    }
  }

  searchDir(dirPath);
  return result;
}

/**
 * 确保路径中的目录存在，如果不存在则创建
 * @param {string} dirPath - 目录路径
 */
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 异步删除目录
 * @param {string} dirPath - 要删除的目录路径
 * @param {number} delayMs - 延迟删除的毫秒数
 */
function deleteDirectoryAsync(dirPath, delayMs = 0) {
  setTimeout(() => {
    try {
      fs.rm(dirPath, { recursive: true, force: true }, (err) => {
        if (err) {
          console.error(`删除目录失败: ${err.message}`);
        } else {
          console.log(`成功删除目录: ${dirPath}`);
        }
      });
    } catch (deleteError) {
      console.error(`删除目录出错: ${deleteError.message}`);
    }
  }, delayMs);
}

module.exports = {
  decompressRedLog,
  downloadAndExtractZip,
  findRedlogFiles,
  ensureDirectoryExists,
  deleteDirectoryAsync
};
