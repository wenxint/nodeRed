require("dotenv").config();
const axios = require("axios");

class DeepSeekService {
  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY;
    this.baseURL = process.env.DEEPSEEK_API_BASE_URL;
    console.log(this.baseURL, "this.baseURL");

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    });
  }

  async generateText(prompt, options = {}) {
    try {
      console.log(prompt, "prompt");
      console.log("1111", "111");

      const response = await this.client.post("/chat/completions", {
        model: options.model || "deepseek-chat",
        messages: prompt,
        stream: false,
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 1000,
      });
      return response.data;
    } catch (error) {
      console.error(
        "DeepSeek API Error:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  async generateCode(prompt, options = {}) {
    try {
      const response = await this.client.post("/chat/completions", {
        model: options.model || "deepseek-coder",
        messages: prompt,
        temperature: options.temperature || 0.2,
        max_tokens: options.max_tokens || 2000,
        stream: false,
      });
      return response.data;
    } catch (error) {
      console.error(
        "DeepSeek API Error:",
        error.response?.data || error.message
      );
      throw error;
    }
  }
}

module.exports = new DeepSeekService();
