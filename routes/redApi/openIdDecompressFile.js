/**
 * @file redlog文件解压接口
 * @description 根据openId、文件名和目录解压特定的redlog文件
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { AppError } = require('../../middleware/errorHandler');
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

    try {
      // 第一步：下载并解压ZIP文件
      await downloadAndExtractZip(openId);

      // 构建文件路径
      const tempDir = path.join(__dirname, '../../temp');
      const userLogDir = path.join(tempDir, `UserLog_${openId}`);

      // 处理dir参数，替换可能的Windows路径分隔符
      const normalizedDir = dir.replace(/\\/g, path.sep);
      const fileDir = path.join(userLogDir, normalizedDir);
      const filePath = path.join(fileDir, file);

      // 检查文件是否存在
      if (!fs.existsSync(filePath)) {
        return next(new AppError(404, `文件不存在: ${filePath}`));
      }

      console.log(`准备解压文件: ${filePath}`);

      // 解压具体的redlog文件，并获取其内容
      const { filePath: decompressedFilePath, content } = await decompressRedLog(filePath, true);

      console.log(`文件解压成功: ${decompressedFilePath}`);

      // 返回解压后的文件内容
      res.status(200).json({
        success: true,
        message: '文件解压成功',
        fileName: path.basename(decompressedFilePath),
        data: content.toString('base64') // 转换为base64格式发送
      });

     // 在返回响应后异步删除临时文件夹（延迟0毫秒）
     deleteDirectoryAsync(userLogDir, 0);// 延迟删除，确保响应已经发送

    } catch (error) {
      console.error('解压文件失败:', error);
      return next(new AppError(500, `解压文件失败: ${error.message}`));
    }

  } catch (error) {
    console.error('处理请求错误:', error);
    return next(new AppError(500, '系统错误，请稍后重试'));
  }
});

module.exports = router;