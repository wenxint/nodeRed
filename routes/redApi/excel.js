/**
 * Excel 文件处理路由模块
 * @description 提供 Excel 文件上传、解析和转换为 JSON 数组的功能
 * @author Node-Red 项目组
 */

// 引入 express 路由模块
const express = require("express");
const router = express.Router();

// 引入路径处理模块（用于拼接/解析文件路径，跨平台兼容）
const path = require("path");
// 引入文件系统模块（用于读取/写入文件，操作本地文件）
const fs = require("fs");
// 引入 xlsx 库（核心：处理 Excel 文件读取和解析）
const XLSX = require("xlsx");
// 引入自定义上传中间件（处理文件上传）
const createUpload = require("../../middleware/upload");
// 引入自定义错误处理类（用于抛出业务异常，统一错误格式）
const { AppError } = require("../../middleware/errorHandler");
// 引入响应工具类（用于封装接口响应格式，统一返回结构）
const ResponseHelper = require("../../common/response");

/**
 * 配置文件上传中间件
 * @description 设置上传目录、文件大小限制和文件类型过滤
 */
const upload = createUpload({
  destination: "uploads/excel", // 上传目录
  fileSize: 10 * 1024 * 1024, // 文件大小限制：10MB
  fileFilter: (req, file, cb) => {
    // 检查文件类型，只允许 Excel 文件
    const allowedMimes = [
      "application/vnd.ms-excel", // .xls
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
      "application/vnd.ms-excel.sheet.macroEnabled.12", // .xlsm
    ];

    const allowedExtensions = [".xls", ".xlsx", ".xlsm"];
    const fileExtension = path.extname(file.originalname).toLowerCase();

    if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
      cb(null, true);
    } else {
      cb(new AppError(400, "只支持 Excel 文件格式 (.xls, .xlsx, .xlsm)"), false);
    }
  },
});

/**
 * 解析 Excel 文件为 JSON 数组
 * @description 读取 Excel 文件的所有工作表，转换为 JSON 格式
 * @param {string} filePath - Excel 文件路径
 * @param {Object} options - 解析选项
 * @returns {Object} 包含所有工作表数据的对象
 */
function parseExcelToJson(filePath, options = {}) {
  try {
    console.log(`开始解析 Excel 文件: ${filePath}`);

    // 读取 Excel 文件
    const workbook = XLSX.readFile(filePath, {
      cellText: false, // 保持原始数据类型
      cellDates: true, // 自动转换日期
      ...options.readOptions,
    });

    const result = {
      fileName: path.basename(filePath),
      sheets: {},
      totalSheets: workbook.SheetNames.length,
      sheetNames: workbook.SheetNames,
    };

    console.log(`Excel 文件包含 ${workbook.SheetNames.length} 个工作表: ${workbook.SheetNames.join(", ")}`);

    // 遍历所有工作表
    workbook.SheetNames.forEach((sheetName, index) => {
      try {
        console.log(`正在解析工作表: ${sheetName}`);

        const worksheet = workbook.Sheets[sheetName];

        // 转换为 JSON 数组
        const jsonData = XLSX.utils.sheet_to_json(worksheet, {
          header: options.useFirstRowAsHeader !== false ? 1 : undefined, // 默认使用第一行作为表头
          defval: options.defaultValue || "", // 空单元格的默认值
          blankrows: options.includeBlankRows || false, // 是否包含空行
          raw: options.keepRawValues || false, // 是否保持原始值
          dateNF: options.dateFormat || "yyyy-mm-dd", // 日期格式
          ...options.sheetOptions,
        });

        // 统计信息
        const stats = {
          rowCount: jsonData.length,
          columnCount: jsonData.length > 0 ? Object.keys(jsonData[0]).length : 0,
          hasData: jsonData.length > 0,
        };

        result.sheets[sheetName] = {
          index: index,
          name: sheetName,
          data: jsonData,
          stats: stats,
        };

        console.log(`工作表 ${sheetName} 解析完成: ${stats.rowCount} 行, ${stats.columnCount} 列`);

      } catch (sheetError) {
        console.error(`解析工作表 ${sheetName} 失败: ${sheetError.message}`);
        result.sheets[sheetName] = {
          index: index,
          name: sheetName,
          error: sheetError.message,
          data: [],
          stats: { rowCount: 0, columnCount: 0, hasData: false },
        };
      }
    });

    console.log(`Excel 文件解析完成`);
    return result;

  } catch (error) {
    console.error(`Excel 文件解析失败: ${error.message}`);
    throw new AppError(400, `Excel 文件解析失败: ${error.message}`);
  }
}

/**
 * 清理上传的临时文件
 * @description 删除上传的临时文件，释放磁盘空间
 * @param {string} filePath - 文件路径
 */
function cleanupTempFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`已清理临时文件: ${filePath}`);
    }
  } catch (error) {
    console.error(`清理临时文件失败: ${error.message}`);
  }
}

/**
 * POST /excel/upload
 * @description 上传 Excel 文件并转换为 JSON 数组格式
 * @route POST /excel/upload
 * @param {File} file - 上传的 Excel 文件（通过 multipart/form-data）
 * @param {string} [options] - 解析选项（JSON 字符串格式）
 * @returns {Object} 包含所有工作表 JSON 数据的响应
 */
router.post("/upload", upload.single("file"), async (req, res, next) => {
  let tempFilePath = null;

  try {
    // 检查是否有文件上传
    if (!req.file) {
      throw new AppError(400, "请选择要上传的 Excel 文件");
    }

    tempFilePath = req.file.path;
    const originalName = req.file.originalname;
    const fileSize = req.file.size;

    console.log(`收到 Excel 文件上传请求: ${originalName} (${fileSize} 字节)`);

    // 解析可选的配置参数
    let parseOptions = {};
    if (req.body.options) {
      try {
        parseOptions = JSON.parse(req.body.options);
        console.log(`使用自定义解析选项:`, parseOptions);
      } catch (error) {
        console.warn(`解析选项格式错误，使用默认配置: ${error.message}`);
      }
    }

    // 解析 Excel 文件
    const result = parseExcelToJson(tempFilePath, parseOptions);

    // 添加文件信息到结果中
    result.fileInfo = {
      originalName: originalName,
      size: fileSize,
      uploadTime: new Date().toISOString(),
      mimeType: req.file.mimetype,
    };

    // 统计总数据量
    let totalRows = 0;
    Object.values(result.sheets).forEach(sheet => {
      if (sheet.stats) {
        totalRows += sheet.stats.rowCount;
      }
    });

    result.summary = {
      totalSheets: result.totalSheets,
      totalRows: totalRows,
      successfulSheets: Object.values(result.sheets).filter(sheet => !sheet.error).length,
      failedSheets: Object.values(result.sheets).filter(sheet => sheet.error).length,
    };

    console.log(`Excel 解析完成: ${result.summary.totalSheets} 个工作表, ${result.summary.totalRows} 行数据`);

    // 使用统一响应格式返回结果
    return ResponseHelper.success(
      res,
      result,
      `Excel 文件解析成功，共处理 ${result.summary.totalSheets} 个工作表，${result.summary.totalRows} 行数据`
    );

  } catch (error) {
    console.error("Excel 文件处理失败:", error);
    next(error);
  } finally {
    // 清理临时文件
    if (tempFilePath) {
      cleanupTempFile(tempFilePath);
    }
  }
});

/**
 * POST /excel/parse-sheet
 * @description 解析指定工作表的数据
 * @route POST /excel/parse-sheet
 * @param {File} file - 上传的 Excel 文件
 * @param {string} sheetName - 工作表名称
 * @param {string} [options] - 解析选项
 * @returns {Object} 指定工作表的 JSON 数据
 */
router.post("/parse-sheet", upload.single("file"), async (req, res, next) => {
  let tempFilePath = null;

  try {
    if (!req.file) {
      throw new AppError(400, "请选择要上传的 Excel 文件");
    }

    const { sheetName } = req.body;
    if (!sheetName) {
      throw new AppError(400, "请指定要解析的工作表名称");
    }

    tempFilePath = req.file.path;
    console.log(`解析指定工作表: ${sheetName}`);

    // 解析可选的配置参数
    let parseOptions = {};
    if (req.body.options) {
      try {
        parseOptions = JSON.parse(req.body.options);
      } catch (error) {
        console.warn(`解析选项格式错误，使用默认配置: ${error.message}`);
      }
    }

    // 读取 Excel 文件
    const workbook = XLSX.readFile(tempFilePath);

    // 检查工作表是否存在
    if (!workbook.SheetNames.includes(sheetName)) {
      throw new AppError(404, `工作表 "${sheetName}" 不存在。可用的工作表: ${workbook.SheetNames.join(", ")}`);
    }

    // 解析指定工作表
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
      header: parseOptions.useFirstRowAsHeader !== false ? 1 : undefined,
      defval: parseOptions.defaultValue || "",
      blankrows: parseOptions.includeBlankRows || false,
      raw: parseOptions.keepRawValues || false,
      dateNF: parseOptions.dateFormat || "yyyy-mm-dd",
      ...parseOptions.sheetOptions,
    });

    const result = {
      fileName: req.file.originalname,
      sheetName: sheetName,
      data: jsonData,
      stats: {
        rowCount: jsonData.length,
        columnCount: jsonData.length > 0 ? Object.keys(jsonData[0]).length : 0,
        hasData: jsonData.length > 0,
      },
      availableSheets: workbook.SheetNames,
    };

    console.log(`工作表 ${sheetName} 解析完成: ${result.stats.rowCount} 行数据`);

    return ResponseHelper.success(
      res,
      result,
      `工作表 "${sheetName}" 解析成功，共 ${result.stats.rowCount} 行数据`
    );

  } catch (error) {
    console.error("工作表解析失败:", error);
    next(error);
  } finally {
    if (tempFilePath) {
      cleanupTempFile(tempFilePath);
    }
  }
});

/**
 * GET /excel/info
 * @description 获取 Excel 文件的基本信息（不解析数据）
 * @route GET /excel/info
 * @returns {Object} API 使用说明和支持的功能
 */
router.get("/info", (req, res) => {
  const apiInfo = {
    name: "Excel 文件处理 API",
    version: "1.0.0",
    description: "提供 Excel 文件上传、解析和转换为 JSON 数组的功能",
    endpoints: {
      "POST /excel/upload": {
        description: "上传 Excel 文件并转换为 JSON 数组",
        parameters: {
          file: "Excel 文件 (multipart/form-data)",
          options: "解析选项 (可选的 JSON 字符串)",
        },
        supportedFormats: [".xls", ".xlsx", ".xlsm"],
        maxFileSize: "10MB",
      },
      "POST /excel/parse-sheet": {
        description: "解析指定工作表的数据",
        parameters: {
          file: "Excel 文件 (multipart/form-data)",
          sheetName: "工作表名称",
          options: "解析选项 (可选的 JSON 字符串)",
        },
      },
      "GET /excel/info": {
        description: "获取 API 使用说明",
      },
    },
    parseOptions: {
      useFirstRowAsHeader: "是否使用第一行作为表头 (默认: true)",
      defaultValue: "空单元格的默认值 (默认: '')",
      includeBlankRows: "是否包含空行 (默认: false)",
      keepRawValues: "是否保持原始值 (默认: false)",
      dateFormat: "日期格式 (默认: 'yyyy-mm-dd')",
    },
    examples: {
      basicUpload: {
        method: "POST",
        url: "/excel/upload",
        formData: {
          file: "example.xlsx",
        },
      },
      customOptions: {
        method: "POST",
        url: "/excel/upload",
        formData: {
          file: "example.xlsx",
          options: JSON.stringify({
            useFirstRowAsHeader: true,
            defaultValue: "N/A",
            includeBlankRows: false,
            dateFormat: "yyyy-mm-dd hh:mm:ss",
          }),
        },
      },
    },
  };

  return ResponseHelper.success(res, apiInfo, "Excel API 信息获取成功");
});

module.exports = router;
