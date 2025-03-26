const express = require('express');
const router = express.Router();
const deepseek = require('../services/deepseek');

// 文本生成接口
router.post('/generate-text', async (req, res) => {
    try {
        const { prompt, options } = req.body;
        if (!prompt) {
            return res.status(400).json({ error: '请提供提示文本' });
        }

        const result = await deepseek.generateText(prompt, options);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: '生成文本时发生错误',
            details: error.message
        });
    }
});

// 代码生成接口
router.post('/generate-code', async (req, res) => {
    try {
        const { prompt, options } = req.body;
        if (!prompt) {
            return res.status(400).json({ error: '请提供代码提示' });
        }

        const result = await deepseek.generateCode(prompt, options);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: '生成代码时发生错误',
            details: error.message
        });
    }
});

module.exports = router;