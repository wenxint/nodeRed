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
    // if (!req.file.originalname.endsWith('.log')) {
    //   fs.unlinkSync(req.file.path);
    //   throw new AppError(400, '只允许上传.log文件');
    // }

    // Python脚本路径
    const pythonScriptPath = path.join(__dirname, '..', '..', 'static', 'RedLogDecompress', 'RedLogDecompress.py');

    // 确保Python脚本存在
    if (!fs.existsSync(pythonScriptPath)) {
      throw new AppError(500, 'Python脚本文件不存在');
    }

    console.log(`执行Python脚本: ${pythonScriptPath}`);
    console.log(`处理日志文件: ${req.file.path}`);

    // 在Linux上，使用python3命令而不是python
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

    // 执行Python脚本，设置shell为true以确保在Linux上正确运行
    const python = spawn(pythonCmd, [pythonScriptPath, req.file.path], {
      shell: true,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        LD_LIBRARY_PATH: path.join(__dirname, '..', '..', 'static', 'RedLogDecompress')
      }
    });

    let stdOutput = '';
    let errorOutput = '';

    // 设置超时时间（5分钟）
    const TIMEOUT = 5 * 60 * 1000;
    let timeoutId;

    // 收集标准输出
    python.stdout.on('data', (data) => {
      const output = data.toString('utf-8');
      stdOutput += output;
      // 将Python输出行一行一行地记录，增加可读性
      output.split('\n').forEach(line => {
        if (line.trim()) console.log(`[Python输出] ${line}`);
      });
    });

    // 收集错误输出
    python.stderr.on('data', (data) => {
      const error = data.toString('utf-8');
      errorOutput += error;
      // 将Python错误行一行一行地记录，增加可读性
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
    if (req.file.path.endsWith('.log')) {
      decompressedFilePath = req.file.path.replace('.log', 'Decompressed.log');
    } else if (req.file.path.endsWith('.redlog')) {
      decompressedFilePath = req.file.path.replace('.redlog', 'Decompressed.redlog');
    } else {
      // 默认情况，使用.log作为后缀
      decompressedFilePath = req.file.path + 'Decompressed.log';
    }


    // 检查解压后的文件是否存在
    if (!fs.existsSync(decompressedFilePath)) {
      console.error('解压后的文件不存在:', decompressedFilePath);
      console.error('Python输出:', stdOutput);
      console.error('Python错误:', errorOutput);
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
      data: decompressedContent.toString('base64'),
      logs: stdOutput // 将完整的Python输出返回给前端
    });

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