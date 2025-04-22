/**
 * @file RedLog文件解压接口
 * @description 提供上传并解压RedLog文件的功能
 */
const express = require("express");
const router = express.Router();
const createUpload = require("../../middleware/upload");
const path = require("path");
const fs = require("fs");
const { AppError } = require("../../middleware/errorHandler");
const { decompressRedLog } = require("../../common/decompressLogshoco");
const ResponseHelper = require("../../common/response");

// 获取配置好的 upload 实例
const upload = createUpload();

/**
 * @route POST /myapi/uploadRedLogDecompress
 * @desc 上传并解压RedLog文件
 * @returns {object} - 返回解压后的文件内容
 */
router.post("/uploadRedLogDecompress", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      throw new AppError(400, "请选择要上传的文件");
    }

    // 检查文件类型
    if (!req.file.originalname.endsWith('.log') && !req.file.originalname.endsWith('.redlog')) {
      fs.unlinkSync(req.file.path);
      throw new AppError(400, '只允许上传.log和.redlog文件');
    }

    console.log(`处理日志文件: ${req.file.path}`);

    try {
      // 使用通用方法解压RedLog文件，并获取解压后的内容
      const { filePath: decompressedFilePath, content } = await decompressRedLog(req.file.path, true);

      console.log(`文件解压成功: ${decompressedFilePath}`);

      // 删除临时文件
      fs.unlinkSync(req.file.path);
      fs.unlinkSync(decompressedFilePath);

      // 使用统一响应格式返回结果
      return ResponseHelper.success(res, {
        data: content.toString('base64')
      }, "文件解压成功");
    } catch (decompressionError) {
      console.error('文件解压失败:', decompressionError);
      throw new AppError(500, `文件解压失败: ${decompressionError.message}`);
    }

  } catch (error) {
    console.error('处理过程中发生错误:', error);
    // 清理临时文件
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    let decompressedPath = null;
    if (req.file) {
      if (req.file.path.endsWith('.log')) {
        decompressedPath = req.file.path.replace('.log', 'Decompressed.log');
      } else if (req.file.path.endsWith('.redlog')) {
        decompressedPath = req.file.path.replace('.redlog', 'Decompressed.redlog');
      } else {
        decompressedPath = req.file.path + 'Decompressed.log';
      }
    }
    if (decompressedPath && fs.existsSync(decompressedPath)) {
      fs.unlinkSync(decompressedPath);
    }
    next(error);
  }
});

module.exports = router;