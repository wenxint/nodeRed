/**
 * @file openId日志获取接口
 * @description 根据用户openId获取日志文件并解压
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { AppError } = require('../../middleware/errorHandler');
const ResponseHelper = require('../../common/response');
const {
  decompressRedLog,
  downloadAndExtractZip,
  findRedlogFiles,
  deleteDirectoryAsync
} = require('../../common/decompressLogshoco');

/**
 * @route POST /myapi/getUserLog
 * @desc 根据openId获取用户日志
 * @param {string} openId - 用户的openId
 * @returns {object} - 返回解压后的文件信息
 */
router.post('/getUserLog', async (req, res, next) => {
  try {
    const { openId } = req.body;

    // 验证openId参数
    if (!openId) {
      return next(new AppError(400, '缺少openId参数'));
    }

    // 为每个请求生成唯一ID，避免并发冲突
    const requestId = Date.now() + '_' + Math.random().toString(36).slice(2, 10);

    try {
      // 临时文件存储路径（加入请求ID，避免并发冲突）
      const tempDir = path.join(__dirname, '../../temp');
      const extractDir = path.join(tempDir, `UserLog_${openId}_${requestId}`);

      // 确保临时目录存在
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // 下载并解压ZIP文件（强制重新下载，指定目录）
      await downloadAndExtractZip(openId, true, extractDir);

      // 获取解压后的文件列表
      let extractedFiles = fs.readdirSync(extractDir);

      console.log(`ZIP文件已成功解压到: ${extractDir}`);

      // 处理特殊的日志文件（.log和.redlog）
      let processedFiles = [];
      for (const file of extractedFiles) {
        const filePath = path.join(extractDir, file);
        const stats = fs.statSync(filePath);

        if (stats.isDirectory()) {
          // 如果是目录，直接添加
          processedFiles.push({
            name: file,
            path: filePath,
            size: stats.size,
            isDirectory: true,
            processed: false
          });
        } else if (file.endsWith('.log') || file.endsWith('.redlog')) {
          try {
            // 使用特殊工具解压日志文件
            console.log(`正在解压日志文件: ${file}`);
            const decompressedFilePath = await decompressRedLog(filePath);

            // 添加原始文件和解压后的文件
            processedFiles.push({
              name: file,
              path: filePath,
              size: stats.size,
              isDirectory: false,
              processed: false
            });

            // 解压后的文件
            const decompressedStats = fs.statSync(decompressedFilePath);
            const decompressedFileName = path.basename(decompressedFilePath);
            processedFiles.push({
              name: decompressedFileName,
              path: decompressedFilePath,
              size: decompressedStats.size,
              isDirectory: false,
              processed: true
            });

            console.log(`日志文件解压完成: ${decompressedFilePath}`);
          } catch (logError) {
            console.error(`解压日志文件失败: ${file}`, logError);
            // 添加原始文件，但标记处理失败
            processedFiles.push({
              name: file,
              path: filePath,
              size: stats.size,
              isDirectory: false,
              processed: false,
              error: logError.message
            });
          }
        } else {
          // 其他文件直接添加
          processedFiles.push({
            name: file,
            path: filePath,
            size: stats.size,
            isDirectory: false,
            processed: false
          });
        }
      }

      // 查找所有.redlog结尾的文件
      const allRedlogFiles = findRedlogFiles(extractDir, extractDir);

      // 过滤掉包含RedFSPProfiler的文件
      const redlogFiles = allRedlogFiles.filter(item => !item.file.includes('RedFSPProfiler'));

      // 使用统一响应格式返回结果
      ResponseHelper.success(res, {
        extractPath: extractDir,
        files: processedFiles,
        redlogFiles: redlogFiles
      }, '文件已成功下载并解压');

      // 在返回响应后异步删除临时文件夹（延迟0毫秒）
      deleteDirectoryAsync(extractDir, 0);

      return; // 已经发送响应，直接返回
    } catch (error) {
      console.log(error,'error');
      // 清理临时目录
      const extractDir = path.join(__dirname, '../../temp', `UserLog_${openId}_${requestId}`);
      deleteDirectoryAsync(extractDir, 0);

      // 处理网络错误
      let message = '获取日志文件失败';
      let statusCode = 500;

      // 处理常见的HTTP错误
      if (error.response) {
        statusCode = error.response.status;
        switch (statusCode) {
          case 404:
            message = `未找到指定openId(${openId})的日志文件`;
            break;
          case 403:
            message = '没有权限访问该日志文件';
            break;
          default:
            message = `获取日志文件失败(${statusCode})`;
        }
      } else if (error.request) {
        // 请求已发送但未收到响应
        message = '日志服务器未响应';
      } else {
        // 请求设置出错
        message = '请求日志文件时出错';
      }

      return next(new AppError(statusCode, message));
    }
  } catch (error) {
    console.error('获取日志文件错误:', error);
    return next(new AppError(500, '系统错误，请稍后重试'));
  }
});

/**
 * @route GET /myapi/checkLogFiles/:openId
 * @desc 检查指定openId的日志文件是否存在
 * @param {string} openId - 用户的openId
 * @returns {object} - 返回文件检查结果
 */
router.get('/checkLogFiles/:openId', async (req, res, next) => {
  try {
    const { openId } = req.params;

    if (!openId) {
      return next(new AppError(400, '缺少openId参数'));
    }

    // 为了兼容性，检查整个temp目录下所有与该openId相关的目录
    const tempDir = path.join(__dirname, '../../temp');
    const logDirPrefix = `UserLog_${openId}`;

    // 检查temp目录是否存在
    if (!fs.existsSync(tempDir)) {
      return ResponseHelper.success(res, {
        exists: false
      }, '日志文件不存在，需要下载');
    }

    // 获取temp目录下所有文件和目录
    const tempDirContents = fs.readdirSync(tempDir);

    // 查找与openId相关的目录（支持新旧命名格式）
    const matchingDirs = tempDirContents.filter(item =>
      item.startsWith(logDirPrefix) &&
      fs.statSync(path.join(tempDir, item)).isDirectory()
    );

    if (matchingDirs.length === 0) {
      return ResponseHelper.success(res, {
        exists: false
      }, '日志文件不存在，需要下载');
    }

    // 使用找到的第一个目录（通常是最新的）
    const extractDir = path.join(tempDir, matchingDirs[0]);

    // 获取文件列表
    const files = fs.readdirSync(extractDir).map(file => {
      const filePath = path.join(extractDir, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        path: filePath,
        size: stats.size,
        isDirectory: stats.isDirectory(),
        createdAt: stats.birthtime
      };
    });

    // 查找所有.redlog结尾的文件
    const allRedlogFiles = findRedlogFiles(extractDir, extractDir);

    // 过滤掉包含RedFSPProfiler的文件
    const redlogFiles = allRedlogFiles.filter(item => !item.file.includes('RedFSPProfiler'));

    // 使用统一响应格式返回结果
    return ResponseHelper.success(res, {
      exists: true,
      extractPath: extractDir,
      files,
      redlogFiles
    }, '日志文件已存在');
  } catch (error) {
    console.error('检查日志文件错误:', error);
    return next(new AppError(500, '系统错误，请稍后重试'));
  }
});

module.exports = router;
