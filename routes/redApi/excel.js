/**
 * Excel 文件处理路由模块
 * @description 提供 Excel 文件上传、解析和转换为 JSON 数组的功能，支持字段映射
 * @author Node-Red 项目组
 *
 * @example 基本使用
 * POST /excel/excelUpload
 * Content-Type: multipart/form-data
 *
 * FormData:
 * - file: Excel文件
 * - options: '{"defaultValue": "", "includeBlankRows": false}' (可选)
 *
 * @example 使用字段映射
 * POST /excel/excelUpload
 * Content-Type: multipart/form-data
 *
 * FormData:
 * - file: Excel文件
 * - map: '{"姓名": "name", "年龄": "age", "电话": "phone"}' (可选)
 * - options: '{"defaultValue": ""}' (可选)
 *
 * 当提供map字段时，系统会将Excel表头字段映射为用户自定义字段名：
 * - Excel表头"姓名"会映射为"name"
 * - Excel表头"年龄"会映射为"age"
 * - Excel表头"电话"会映射为"phone"
 *
 * 返回的数据中，对象的key将使用映射后的字段名而不是原始表头
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
 * 生成唯一文件名
 * @description 为避免多用户并发上传时文件名冲突，生成带时间戳和随机数的唯一文件名
 * @param {string} originalName - 原始文件名
 * @returns {string} 唯一文件名
 */
function generateUniqueFileName(originalName) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const ext = path.extname(originalName);
  const baseName = path.basename(originalName, ext);
  return `${baseName}_${timestamp}_${random}${ext}`;
}

/**
 * 配置文件上传中间件
 * @description 设置上传目录、文件大小限制和文件类型过滤
 */
const upload = createUpload({
  destination: "uploads/excel", // 上传目录
  fileSize: 10 * 1024 * 1024, // 文件大小限制：10MB
  filename: (req, file, cb) => {
    // 生成唯一文件名避免冲突
    const uniqueName = generateUniqueFileName(file.originalname);
    cb(null, uniqueName);
  },
  fileFilter: (req, file, cb) => {
    // 检查文件类型，只允许 Excel 文件
    const allowedMimes = [
      "application/vnd.ms-excel", // .xls
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
      "application/vnd.ms-excel.sheet.macroEnabled.12", // .xlsm
    ];

    const allowedExtensions = [".xls", ".xlsx", ".xlsm"];
    const fileExtension = path.extname(file.originalname).toLowerCase();

    if (
      allowedMimes.includes(file.mimetype) ||
      allowedExtensions.includes(fileExtension)
    ) {
      cb(null, true);
    } else {
      cb(
        new AppError(400, "只支持 Excel 文件格式 (.xls, .xlsx, .xlsm)"),
        false
      );
    }
  },
});

/**
 * 解析 Excel 文件为二维数组格式
 * @description 读取 Excel 文件的所有工作表，转换为二维数组格式，第一行作为对象的 key
 * @param {string} filePath - Excel 文件路径
 * @param {Object} options - 解析选项
 * @param {Object} [fieldMapping] - 字段映射关系对象，key为Excel表头，value为用户自定义字段名
 * @returns {Object} 包含所有工作表数据的对象
 */
function parseExcelToJson(filePath, options = {}, fieldMapping = null) {
  try {
    console.log(`开始解析 Excel 文件: ${filePath}`);
    if (fieldMapping) {
      console.log(`使用字段映射:`, fieldMapping);
    }

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
      fieldMapping: fieldMapping, // 添加映射信息到结果中
    };

    console.log(
      `Excel 文件包含 ${
        workbook.SheetNames.length
      } 个工作表: ${workbook.SheetNames.join(", ")}`
    );

    // 遍历所有工作表
    workbook.SheetNames.forEach((sheetName, index) => {
      try {
        console.log(`正在解析工作表: ${sheetName}`);

        const worksheet = workbook.Sheets[sheetName];

        // 先获取原始数据（不使用第一行作为表头）
        const rawData = XLSX.utils.sheet_to_json(worksheet, {
          header: 1, // 使用数字索引作为表头，返回二维数组
          defval: options.defaultValue || "", // 空单元格的默认值
          blankrows: options.includeBlankRows || false, // 是否包含空行
          raw: options.keepRawValues || false, // 是否保持原始值
          dateNF: options.dateFormat || "yyyy-mm-dd", // 日期格式
          ...options.sheetOptions,
        });

        // 转换为指定格式：第一行作为 key，后续行作为对象数组
        let formattedData = [];

        if (rawData.length > 0) {
          const headers = rawData[0]; // 第一行作为表头
          console.log(`原始表头: ${headers}`);

          // 从第二行开始处理数据
          for (let i = 1; i < rawData.length; i++) {
            const row = rawData[i];
            const rowObject = {};

            // 将每一行数据与表头对应
            headers.forEach((header, colIndex) => {
              if (header) {
                console.log(`列索引: ${colIndex}, 表头: ${header}`);
                const cellValue = row[colIndex] || options.defaultValue || "";

                // 如果有字段映射，使用映射后的字段名，否则使用原始表头
                let finalFieldName = header;
                if (fieldMapping && fieldMapping[header]) {
                  finalFieldName = fieldMapping[header];
                  console.log(`字段映射: ${header} -> ${finalFieldName}`);
                }

                rowObject[finalFieldName || `列${colIndex + 1}`] = cellValue;
              }
            });

            formattedData.push(rowObject);
          }
        }

        // 统计信息
        const stats = {
          rowCount: formattedData.length,
          columnCount: rawData.length > 0 ? rawData[0].length : 0,
          hasData: formattedData.length > 0,
          headers: rawData.length > 0 ? rawData[0] : [],
          mappedHeaders: fieldMapping ? Object.keys(fieldMapping).map(key => ({
            original: key,
            mapped: fieldMapping[key]
          })) : null,
        };

        result.sheets[sheetName] = {
          index: index,
          name: sheetName,
          data: [formattedData], // 包装成二维数组格式
          stats: stats,
        };

        console.log(
          `工作表 ${sheetName} 解析完成: ${stats.rowCount} 行, ${stats.columnCount} 列`
        );
      } catch (sheetError) {
        console.error(`解析工作表 ${sheetName} 失败: ${sheetError.message}`);
        result.sheets[sheetName] = {
          index: index,
          name: sheetName,
          error: sheetError.message,
          data: [[]],
          stats: { rowCount: 0, columnCount: 0, hasData: false, headers: [] },
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
 * 安全清理上传的临时文件
 * @description 删除上传的临时文件，释放磁盘空间，增强错误处理
 * @param {string} filePath - 文件路径
 * @returns {Promise<boolean>} 清理是否成功
 */
async function cleanupTempFile(filePath) {
  if (!filePath) {
    console.warn("清理临时文件: 文件路径为空");
    return false;
  }

  try {
    // 检查文件是否存在
    await fs.promises.access(filePath, fs.constants.F_OK);

    // 删除文件
    await fs.promises.unlink(filePath);
    console.log(`已清理临时文件: ${filePath}`);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log(`临时文件不存在，无需清理: ${filePath}`);
      return true;
    } else {
      console.error(`清理临时文件失败: ${filePath}, 错误: ${error.message}`);
      return false;
    }
  }
}

/**
 * POST /excel/excelUpload
 * @description 上传 Excel 文件并转换为二维数组格式
 * @route POST /excel/excelUpload
 * @param {File} file - 上传的 Excel 文件（通过 multipart/form-data）
 * @param {string} [options] - 解析选项（JSON 字符串格式）
 * @param {string} [map] - 字段映射关系（JSON 字符串格式），key为Excel表头，value为用户自定义字段名
 * @returns {Object} 包含所有工作表二维数组数据的响应
 */
router.post("/excelUpload", upload.single("file"), async (req, res, next) => {
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
    console.log(`临时文件路径: ${tempFilePath}`);

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

    // 解析字段映射参数
    let fieldMapping = null;
    if (req.body.map) {
      try {
        fieldMapping = JSON.parse(req.body.map);
        console.log(`收到字段映射配置:`, fieldMapping);

        // 验证映射对象格式
        if (typeof fieldMapping !== 'object' || fieldMapping === null) {
          throw new Error('映射配置必须是一个对象');
        }

        // 验证映射对象的值都是字符串
        for (const [key, value] of Object.entries(fieldMapping)) {
          if (typeof value !== 'string') {
            throw new Error(`映射值必须是字符串，发现无效值: ${key} -> ${value}`);
          }
        }

      } catch (error) {
        console.warn(`字段映射配置解析错误: ${error.message}`);
        throw new AppError(400, `字段映射配置格式错误: ${error.message}`);
      }
    }

    // 解析 Excel 文件，传入字段映射
    const result = parseExcelToJson(tempFilePath, parseOptions, fieldMapping);
    console.log("Excel 解析结果:", JSON.stringify(result, null, 2));

    // 添加文件信息到结果中
    result.fileInfo = {
      originalName: originalName,
      size: fileSize,
      uploadTime: new Date().toISOString(),
      mimeType: req.file.mimetype,
      tempFileName: path.basename(tempFilePath),
      hasFieldMapping: fieldMapping !== null,
    };

    // 统计总数据量
    let totalRows = 0;
    Object.values(result.sheets).forEach((sheet) => {
      if (sheet.stats) {
        totalRows += sheet.stats.rowCount;
      }
    });

    result.summary = {
      totalSheets: result.totalSheets,
      totalRows: totalRows,
      successfulSheets: Object.values(result.sheets).filter(
        (sheet) => !sheet.error
      ).length,
      failedSheets: Object.values(result.sheets).filter((sheet) => sheet.error)
        .length,
      fieldMappingApplied: fieldMapping !== null,
      mappedFieldsCount: fieldMapping ? Object.keys(fieldMapping).length : 0,
    };

    console.log(
      `Excel 解析完成: ${result.summary.totalSheets} 个工作表, ${result.summary.totalRows} 行数据${fieldMapping ? ', 已应用字段映射' : ''}`
    );

    // 使用统一响应格式返回结果
    return ResponseHelper.success(
      res,
      result,
      `Excel 文件解析成功，共处理 ${result.summary.totalSheets} 个工作表，${result.summary.totalRows} 行数据${fieldMapping ? '，已应用字段映射' : ''}`
    );
  } catch (error) {
    console.error("Excel 文件处理失败:", error);
    next(error);
  } finally {
    // 确保在所有情况下都清理临时文件
    if (tempFilePath) {
      try {
        await cleanupTempFile(tempFilePath);
      } catch (cleanupError) {
        console.error("清理临时文件时发生错误:", cleanupError);
        // 不抛出错误，避免影响主要的响应
      }
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
// router.post("/parse-sheet", upload.single("file"), async (req, res, next) => {
//   let tempFilePath = null;

//   try {
//     if (!req.file) {
//       throw new AppError(400, "请选择要上传的 Excel 文件");
//     }

//     const { sheetName } = req.body;
//     if (!sheetName) {
//       throw new AppError(400, "请指定要解析的工作表名称");
//     }

//     tempFilePath = req.file.path;
//     console.log(`解析指定工作表: ${sheetName}`);

//     // 解析可选的配置参数
//     let parseOptions = {};
//     if (req.body.options) {
//       try {
//         parseOptions = JSON.parse(req.body.options);
//       } catch (error) {
//         console.warn(`解析选项格式错误，使用默认配置: ${error.message}`);
//       }
//     }

//     // 读取 Excel 文件
//     const workbook = XLSX.readFile(tempFilePath);

//     // 检查工作表是否存在
//     if (!workbook.SheetNames.includes(sheetName)) {
//       throw new AppError(404, `工作表 "${sheetName}" 不存在。可用的工作表: ${workbook.SheetNames.join(", ")}`);
//     }

//     // 解析指定工作表
//     const worksheet = workbook.Sheets[sheetName];
//     const jsonData = XLSX.utils.sheet_to_json(worksheet, {
//       header: parseOptions.useFirstRowAsHeader !== false ? 1 : undefined,
//       defval: parseOptions.defaultValue || "",
//       blankrows: parseOptions.includeBlankRows || false,
//       raw: parseOptions.keepRawValues || false,
//       dateNF: parseOptions.dateFormat || "yyyy-mm-dd",
//       ...parseOptions.sheetOptions,
//     });

//     const result = {
//       fileName: req.file.originalname,
//       sheetName: sheetName,
//       data: jsonData,
//       stats: {
//         rowCount: jsonData.length,
//         columnCount: jsonData.length > 0 ? Object.keys(jsonData[0]).length : 0,
//         hasData: jsonData.length > 0,
//       },
//       availableSheets: workbook.SheetNames,
//     };

//     console.log(`工作表 ${sheetName} 解析完成: ${result.stats.rowCount} 行数据`);

//     return ResponseHelper.success(
//       res,
//       result,
//       `工作表 "${sheetName}" 解析成功，共 ${result.stats.rowCount} 行数据`
//     );

//   } catch (error) {
//     console.error("工作表解析失败:", error);
//     next(error);
//   } finally {
//     if (tempFilePath) {
//       cleanupTempFile(tempFilePath);
//     }
//   }
// });

/**
 * GET /excel/info
 * @description 获取 Excel 文件的基本信息（不解析数据）
 * @route GET /excel/info
 * @returns {Object} API 使用说明和支持的功能
 */
// router.get("/info", (req, res) => {
//   const apiInfo = {
//     name: "Excel 文件处理 API",
//     version: "1.0.0",
//     description: "提供 Excel 文件上传、解析和转换为 JSON 数组的功能",
//     endpoints: {
//       "POST /excel/upload": {
//         description: "上传 Excel 文件并转换为 JSON 数组",
//         parameters: {
//           file: "Excel 文件 (multipart/form-data)",
//           options: "解析选项 (可选的 JSON 字符串)",
//         },
//         supportedFormats: [".xls", ".xlsx", ".xlsm"],
//         maxFileSize: "10MB",
//       },
//       "POST /excel/parse-sheet": {
//         description: "解析指定工作表的数据",
//         parameters: {
//           file: "Excel 文件 (multipart/form-data)",
//           sheetName: "工作表名称",
//           options: "解析选项 (可选的 JSON 字符串)",
//         },
//       },
//       "GET /excel/info": {
//         description: "获取 API 使用说明",
//       },
//     },
//     parseOptions: {
//       useFirstRowAsHeader: "是否使用第一行作为表头 (默认: true)",
//       defaultValue: "空单元格的默认值 (默认: '')",
//       includeBlankRows: "是否包含空行 (默认: false)",
//       keepRawValues: "是否保持原始值 (默认: false)",
//       dateFormat: "日期格式 (默认: 'yyyy-mm-dd')",
//     },
//     examples: {
//       basicUpload: {
//         method: "POST",
//         url: "/excel/upload",
//         formData: {
//           file: "example.xlsx",
//         },
//       },
//       customOptions: {
//         method: "POST",
//         url: "/excel/upload",
//         formData: {
//           file: "example.xlsx",
//           options: JSON.stringify({
//             useFirstRowAsHeader: true,
//             defaultValue: "N/A",
//             includeBlankRows: false,
//             dateFormat: "yyyy-mm-dd hh:mm:ss",
//           }),
//         },
//       },
//     },
//   };

//   return ResponseHelper.success(res, apiInfo, "Excel API 信息获取成功");
// });

module.exports = router;
