const express = require("express");
const router = express.Router();
const createUpload = require("../../middleware/upload");
const path = require("path");
const fs = require("fs");
const { AppError } = require("../../middleware/errorHandler");
const { spawn } = require('child_process');

// 获取配置好的 upload 实例
const upload = createUpload();

// 文件上传接口
router.post("/uploadRedLogDecompress", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      throw new AppError(400, "请选择要上传的文件");
    }

    // 检查文件类型
    if (!req.file.originalname.endsWith('.log')) {
      fs.unlinkSync(req.file.path);
      throw new AppError(400, '只允许上传.log文件');
    }

    // Python脚本路径
    const pythonScriptPath = path.join(__dirname, '..', '..', 'static', 'RedLogDecompress', 'RedLogDecompress.py');

    // 确保Python脚本存在
    if (!fs.existsSync(pythonScriptPath)) {
      throw new AppError(500, 'Python脚本文件不存在');
    }

    // 执行Python脚本
    const python = spawn('python', [pythonScriptPath, req.file.path]);

    let stdOutput = '';
    let errorOutput = '';

    // 收集标准输出
    python.stdout.on('data', (data) => {
      const output = data.toString();
      stdOutput += output;
      console.log(`Python输出: ${output}`);
    });

    // 收集错误输出
    python.stderr.on('data', (data) => {
      const error = data.toString();
      errorOutput += error;
      console.error(`Python错误: ${error}`);
    });

    // 等待Python脚本执行完成
    await new Promise((resolve, reject) => {
      python.on('close', (code) => {
        if (code !== 0) {
          console.error(`Python脚本退出码: ${code}`);
          reject(new Error(`Python脚本执行失败: ${errorOutput}`));
        } else {
          console.log(`Python脚本执行完成，输出: ${stdOutput}`);
          resolve();
        }
      });
    });

    // 获取解压后的文件路径
    const decompressedFilePath = req.file.path.replace('.log', 'Decompressed.log');

    // 检查解压后的文件是否存在
    if (!fs.existsSync(decompressedFilePath)) {
      throw new AppError(500, '文件解压失败');
    }

    // 读取解压后的文件
    const decompressedContent = fs.readFileSync(decompressedFilePath);

    // 删除临时文件
    fs.unlinkSync(req.file.path);
    fs.unlinkSync(decompressedFilePath);

    // 设置响应头和状态码
    res.status(200).json({
      success: true,
      data: decompressedContent.toString('base64')
    });

  } catch (error) {
    // 清理临时文件
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    const decompressedPath = req.file ? req.file.path.replace('.log', 'Decompressed.log') : null;
    if (decompressedPath && fs.existsSync(decompressedPath)) {
      fs.unlinkSync(decompressedPath);
    }
    next(error);
  }
});

module.exports = router;