/**
 * @file redlog文件解压接口
 * @description 根据openId、文件名和目录解压特定的redlog文件
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
  deleteDirectoryAsync
} = require('../../common/decompressLogshoco');

/**
 * @route POST /myapi/openIdDecompressFile
 * @desc 解压特定的redlog文件
 * @param {string} openId - 用户的openId
 * @param {string} file - 文件名
 * @param {string} dir - 文件目录
 * @returns {object} - 返回解压后的文件内容
 */
router.post('/openIdDecompressFile', async (req, res, next) => {
  try {
    const { openId, file, dir } = req.body;

    // 验证参数
    if (!openId) {
      return next(new AppError(400, '缺少openId参数'));
    }
    if (!file) {
      return next(new AppError(400, '缺少file参数'));
    }
    if (!dir) {
      return next(new AppError(400, '缺少dir参数'));
    }

    // 验证文件后缀
    if (!file.endsWith('.log') && !file.endsWith('.redlog')) {
      return next(new AppError(400, '只支持解压.log和.redlog文件'));
    }

    // 为每个请求生成唯一ID，避免并发冲突
    const requestId = Date.now() + '_' + Math.random().toString(36).slice(2, 10);

    try {
      // 构建临时目录（加入请求ID，避免并发冲突）
      const tempDir = path.join(__dirname, '../../temp');
      const userLogDir = path.join(tempDir, `UserLog_${openId}_${requestId}`);

      // 确保临时目录存在
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // 第一步：下载并解压ZIP文件（传入请求ID参数指定目录）
      await downloadAndExtractZip(openId, false, userLogDir);

      // 处理dir参数，替换可能的Windows路径分隔符
      const normalizedDir = dir.replace(/\\/g, path.sep);
      const fileDir = path.join(userLogDir, normalizedDir);
      const filePath = path.join(fileDir, file);

      // 检查文件是否存在
      if (!fs.existsSync(filePath)) {
        // 清理临时目录然后返回错误
        deleteDirectoryAsync(userLogDir, 0);
        return next(new AppError(404, `文件不存在: ${filePath}`));
      }

      console.log(`准备解压文件: ${filePath}`);

      // 解压具体的redlog文件，并获取其内容
      const { filePath: decompressedFilePath, content } = await decompressRedLog(filePath, true);

      console.log(`文件解压成功: ${decompressedFilePath}`);

      // 使用统一响应格式返回结果
      ResponseHelper.success(res, {
        fileName: path.basename(decompressedFilePath),
        data: content.toString('base64') // 转换为base64格式发送
      }, '文件解压成功');

     // 在返回响应后异步删除临时文件夹（延迟0毫秒）
     deleteDirectoryAsync(userLogDir, 0);// 延迟删除，确保响应已经发送

    } catch (error) {
      console.error('解压文件失败:', error);
      // 尝试清理临时目录
      const userLogDir = path.join(__dirname, '../../temp', `UserLog_${openId}_${requestId}`);
      deleteDirectoryAsync(userLogDir, 0);
      return next(new AppError(500, `解压文件失败: ${error.message}`));
    }

  } catch (error) {
    console.error('处理请求错误:', error);
    return next(new AppError(500, '系统错误，请稍后重试'));
  }
});

module.exports = router;