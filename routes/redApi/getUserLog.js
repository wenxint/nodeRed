/**
 * @file openId日志获取接口
 * @description 根据用户openId获取日志文件并解压
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { AppError } = require('../../middleware/errorHandler');
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

    try {
      // 临时文件存储路径
      const tempDir = path.join(__dirname, '../../temp');

      // 下载并解压ZIP文件（强制重新下载）
      const extractDir = await downloadAndExtractZip(openId, true);

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
      const redlogFiles = findRedlogFiles(extractDir, extractDir);

      // 保存返回结果，以便在删除文件夹前返回
      const responseData = {
        success: true,
        message: '文件已成功下载并解压',
        extractPath: extractDir,
        files: processedFiles,
        redlogFiles: redlogFiles
      };

      // 返回成功信息
      res.status(200).json(responseData);

      // 在返回响应后异步删除临时文件夹（延迟0毫秒）
      deleteDirectoryAsync(extractDir, 0);

      return; // 已经发送响应，直接返回
    } catch (error) {
      console.log(error,'error');
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

    // 检查解压目录
    const extractDir = path.join(__dirname, '../../temp', `UserLog_${openId}`);

    if (fs.existsSync(extractDir)) {
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
      const redlogFiles = findRedlogFiles(extractDir, extractDir);

      // 保存返回结果，以便在删除文件夹前返回
      const responseData = {
        success: true,
        exists: true,
        message: '已找到日志文件',
        extractPath: extractDir,
        files: files,
        redlogFiles: redlogFiles
      };

      // 返回成功信息
      res.status(200).json(responseData);

      // 在返回响应后异步删除临时文件夹（延迟5秒）
      deleteDirectoryAsync(extractDir, 0);

      return; // 已经发送响应，直接返回
    } else {
      return res.status(200).json({
        success: true,
        exists: false,
        message: '未找到该openId的日志文件'
      });
    }
  } catch (error) {
    console.error('检查日志文件错误:', error);
    return next(new AppError(500, '系统错误，请稍后重试'));
  }
});

module.exports = router;
