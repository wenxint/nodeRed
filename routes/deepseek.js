const express = require("express");
const router = express.Router();
const deepseek = require("../services/deepseek");
const { AppError } = require('../middleware/errorHandler');
const ResponseHelper = require('../common/response');

// 文本生成接口
router.post("/generate-text", async (req, res, next) => {
  try {
    const { prompt, options } = req.body;
    if (!prompt) {
      throw new AppError(400, "请提供提示文本");
    }

    const result = await deepseek.generateText(prompt, options);
    return ResponseHelper.success(res, result, '文本生成成功');
  } catch (error) {
    next(error);
  }
});

// 代码生成接口
router.post("/generate-code", async (req, res, next) => {
  try {
    const { prompt, options } = req.body;
    if (!prompt) {
      throw new AppError(400, "请提供代码提示");
    }

    const result = await deepseek.generateCode(prompt, options);
    return ResponseHelper.success(res, result, '代码生成成功');
  } catch (error) {
    next(error);
  }
});

module.exports = router;
