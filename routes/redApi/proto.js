// 引入 express 路由模块
const express = require("express");
const router = express.Router();
// 引入自定义上传中间件（未在当前代码中使用，可能用于文件上传场景）
const createUpload = require("../../middleware/upload");

// 引入路径处理模块（用于拼接/解析文件路径，跨平台兼容）
const path = require("path");
// 引入 protobufjs 库（核心：处理 protobuf 编解码，支持 proto 文件加载和消息类型解析）
const protobuf = require("protobufjs");
// 引入文件系统模块（用于读取/写入文件，操作本地文件）
const fs = require("fs");
// 引入自定义错误处理类（用于抛出业务异常，统一错误格式）
const { AppError } = require("../../middleware/errorHandler");
// 引入响应工具类（用于封装接口响应格式，统一返回结构）
const ResponseHelper = require("../../common/response");

// 使用 Map 缓存已加载的 protobuf Root 实例（避免重复加载同一个 proto 文件，提升性能）
const rootCache = new Map();

/**
 * 核心功能：根据包名查找对应的 proto 文件路径和消息类型名
 * @description 支持服务调用（如 "zonepb.LobbyService"）和非服务调用（如 "zonepb.pvppb.ascensionpb.UpdateNTF"）两种场景，
 *              通过递归搜索目录、匹配文件名/文件内容等策略定位目标 proto 文件，并推断消息类型名
 * @param {string} packageName - 包名（服务调用场景为服务包名，非服务调用场景为类型包名）
 * @param {string} methodName - 方法名（如 "Heartbeat" 或 "Push"，用于推断消息类型）
 * @param {number} resType - 协议类型（1表示请求，其他表示响应，区分请求/响应消息类型）
 * @param {string} typeName - 类型名（非服务调用时使用，如 "UpdateNTF"）
 * @returns {Object|null} 包含 proto 文件路径（file）和消息类型名（typeName）的对象，找不到则返回 null
 */
function findProtoFileByPackage(packageName, methodName, resType, typeName) {
  // 打印调试日志：标记查找开始（方便排查问题）
  console.log(`======== 查找包路径开始 ========`);
  console.log(`包名: ${packageName}, 方法名: ${methodName}, 协议类型: ${resType}`);

  try {
    // 声明变量：目标文件夹名、服务名、类型名（用于区分服务调用和非服务调用场景）
    let targetFolder, serviceName, typeName;

    // 场景1：包名包含 "Service"（服务调用场景，如 "zonepb.LobbyService"）
    if (packageName.includes('Service')) {
      // 按点分割包名（如 ["zonepb", "LobbyService"]）
      const parts = packageName.split(".");
      // 目标文件夹名取倒数第二部分（如 "zonepb"），若只有一级则取第一部分（兼容短包名）
      targetFolder = parts.length > 1 ? parts[parts.length - 2] : parts[0];
      // 服务名取最后一部分（如 "LobbyService"）
      serviceName = parts[parts.length - 1];
      // 类型名初始化为 null（后续从文件内容推断）
      typeName = null;
    } else {
      // 场景2：非服务调用（如 "zonepb.pvppb.ascensionpb.UpdateNTF"）
      // 按点分割包名（如 ["zonepb", "pvppb", "ascensionpb", "UpdateNTF"]）
      const parts = packageName.split(".");
      // 类型名取最后一部分（如 "UpdateNTF"）
      typeName = parts.pop();
      // 剩余部分拼接为包路径（如 "zonepb.pvppb.ascensionpb"）
      const packagePath = parts.join(".");
      // 目标文件夹名取包路径的最后一级（如 "ascensionpb"）
      targetFolder = parts.length > 0 ? parts[parts.length - 1] : '';
      // 非服务调用无服务名
      serviceName = '';
      // 打印非服务调用调试信息（辅助排查）
      console.log(`非服务调用: 类型名=${typeName}, 包路径=${packagePath}, 目标文件夹=${targetFolder}`);
    }

    // 打印关键变量调试信息（辅助开发调试）
    console.log(`目标文件夹: ${targetFolder}`);
    console.log(`服务名: ${serviceName}`);
    if (typeName) console.log(`预设类型名: ${typeName}`);

    // 构建 proto 文件的基础目录（指向项目根目录下的 Proto 文件夹，所有 proto 文件的存储根路径）
    const baseDir = path.join(__dirname, "..", "..", "Proto");
    console.log(`基础目录: ${baseDir}`);

    /**
     * 辅助函数：递归查找目标文件夹（匹配 targetFolder）
     * @description 从基础目录开始递归搜索，找到与目标文件夹名（如 "act0152pb"）匹配的目录，
     *              并调用后续函数进一步处理该目录下的文件
     * @param {string} dir - 当前搜索的目录路径（初始为基础目录，后续递归子目录）
     * @returns {Object|null} 匹配到的文件路径和类型名对象，找不到返回 null
     */
    function findTargetFolder(dir) {
      try {
        // 读取当前目录下的所有文件/文件夹（同步读取，简单直接）
        const items = fs.readdirSync(dir);

        // 遍历目录下的每个条目（文件或文件夹）
        for (const item of items) {
          const fullPath = path.join(dir, item); // 拼接完整路径（避免相对路径问题）
          const stats = fs.statSync(fullPath); // 获取文件状态（判断是文件还是文件夹）

          if (stats.isDirectory()) { // 条目是文件夹（继续处理）
            // 如果文件夹名匹配目标文件夹（如 "act0152pb"）
            if (item === targetFolder) {
              console.log(`找到目标文件夹: ${fullPath}`);
              // 读取目标文件夹下的所有文件（获取该目录下的所有文件名）
              const files = fs.readdirSync(fullPath);
              console.log(`文件夹内容: ${files.join(', ')}`);
              // 调用 findProtoFileAndType 查找 proto 文件并确定类型名（核心逻辑入口）
              const result = findProtoFileAndType(files, fullPath, targetFolder, serviceName, methodName, resType, typeName);
              if (result) return result; // 找到则返回结果（提前终止递归）
            }
            // 递归搜索子目录（处理嵌套文件夹，例如 Proto/zonepb/pvppb/ascensionpb 结构）
            const result = findTargetFolder(fullPath);
            if (result) return result; // 子目录找到则返回结果（提前终止递归）
          }
        }
        return null; // 未找到目标文件夹（递归结束）
      } catch (err) {
        console.error(`搜索目录失败: ${err.message}`);
        return null; // 异常处理（避免程序崩溃）
      }
    }

    /**
     * 辅助函数：在目标文件夹中查找 proto 文件并确定消息类型名
     * @description 基于目标文件夹下的文件列表，通过文件名/内容匹配找到目标 proto 文件，
     *              并根据文件内容推断消息类型名（带包名前缀）
     * @param {string[]} files - 目标文件夹下的所有文件名（用于筛选 proto 文件）
     * @param {string} fullPath - 目标文件夹的完整路径（用于拼接文件绝对路径）
     * @param {string} targetFolder - 目标文件夹名（如 "act0152pb"，辅助匹配）
     * @param {string} serviceName - 服务名（服务调用场景，用于匹配服务定义）
     * @param {string} methodName - 方法名（用于匹配 rpc 方法定义）
     * @param {number} resType - 协议类型（1=请求，其他=响应，区分请求/响应类型）
     * @param {string} typeName - 类型名（非服务调用场景，用于匹配消息/枚举定义）
     * @returns {Object|null} 包含文件路径和类型名的对象，找不到返回 null
     */
    function findProtoFileAndType(files, fullPath, targetFolder, serviceName, methodName, resType, typeName) {
      // 调用 findProtoFile 查找匹配的 proto 文件（核心筛选逻辑）
      const protoFile = findProtoFile(files, targetFolder, serviceName, fullPath, typeName);

      if (!protoFile) { // 未找到 proto 文件（提前返回）
        console.log(`未找到匹配的proto文件`);
        return null;
      }

      console.log(`找到proto文件: ${protoFile}`);
      const filePath = path.join(fullPath, protoFile); // 拼接 proto 文件完整路径（绝对路径）

      // 读取 proto 文件内容（用于后续类型推断，需处理文件读取异常）
      let content;
      try {
        content = fs.readFileSync(filePath, 'utf8');
      } catch (err) {
        console.error(`无法读取proto文件: ${filePath}, 错误: ${err.message}`);
        return null; // 读取失败时返回 null
      }

      let finalTypeName = ''; // 最终确定的消息类型名（带包名前缀，如 "actpb.act0152pb.HeartbeatRequest"）

      // 判断是否是服务调用场景（包名包含 "Service"）
      if (packageName.includes('Service')) {
        // 服务调用：需要根据方法名查找请求/响应类型（核心逻辑）
        console.log(`查找服务方法 ${methodName} 的${resType === 1 ? '请求' : '响应'}类型`);

        // 正则匹配 rpc 方法定义（如 "rpc Heartbeat(RequestType) returns (ResponseType)"）
        // 正则说明：匹配 "rpc" 关键字 + 方法名 + 括号内的请求类型 + "returns" + 括号内的响应类型
        const methodRegex = new RegExp(`rpc\\s+${methodName}\\s*\\(\\s*([^\\)]+)\\s*\\)\\s*returns\\s*\\(\\s*([^\\)]+)\\s*\\)`, 'i');
        const match = content.match(methodRegex);

        if (match) { // 匹配到方法定义（提取请求/响应类型）
          const requestType = match[1].trim(); // 请求类型（如 "RequestType"）
          const responseType = match[2].trim(); // 响应类型（如 "ResponseType"）
          console.log(`找到方法定义: rpc ${methodName}(${requestType}) returns (${responseType})`);

          // 根据协议类型（resType）确定最终类型名（带包名前缀）
          if (resType === 1) { // 请求类型
            // 如果请求类型已包含包名（如 "actpb.RequestType"），直接使用；否则拼接包名前缀（去除服务名部分）
            finalTypeName = requestType.includes('.') ? requestType : `${packageName.split('.').slice(0, -1).join('.')}.${requestType}`;
          } else { // 响应类型
            finalTypeName = responseType.includes('.') ? responseType : `${packageName.split('.').slice(0, -1).join('.')}.${responseType}`;
          }
        } else { // 未匹配到方法定义（使用通用命名规则推断）
          console.log(`在文件中未找到方法 ${methodName} 的定义`);
          // 通用命名规则：请求类型为 "MethodNameRequest"，响应类型为 "MethodNameResponse"
          const prefix = packageName.split('.').slice(0, -1).join('.'); // 包名前缀（去除服务名）
          finalTypeName = resType === 1 ? `${prefix}.${methodName}Request` : `${prefix}.${methodName}Response`;
          console.log(`使用通用命名规则推断类型: ${finalTypeName}`);
        }
      } else {
        // 非服务调用：直接使用预设类型名或从文件内容推断（处理消息/枚举类型）
        if (typeName) { // 有预设类型名（如 "UpdateNTF"）
          console.log(`使用预设的类型名: ${typeName}`);

          // 从 proto 文件中提取包名（如 "package actpb.act0152pb;"）
          const packageMatch = content.match(/package\s+([^;]+);/);
          const packagePrefix = packageMatch ? packageMatch[1].trim() : '';

          // 确定完整类型名（带包名前缀）
          if (typeName.includes('.')) { // 类型名已包含包名（如 "actpb.UpdateNTF"）
            finalTypeName = typeName;
          } else if (packagePrefix) { // 使用文件中定义的包名拼接（优先使用文件自身包名）
            finalTypeName = `${packagePrefix}.${typeName}`;
          } else { // 从调用包名中提取前缀拼接（兼容文件未定义包名的情况）
            const parts = packageName.split('.');
            parts.pop(); // 移除类型名部分（如 ["zonepb", "pvppb", "ascensionpb"]）
            const packagePath = parts.join('.');
            finalTypeName = packagePath ? `${packagePath}.${typeName}` : typeName;
          }

          // 验证类型是否存在（检查文件中是否有该消息/枚举定义，避免类型名错误）
          const typePattern = new RegExp(`(message|enum)\\s+${typeName}\\s*\\{`, 'i');
          if (!typePattern.test(content)) {
            console.log(`警告: 在文件中未找到类型 ${typeName} 的定义`);
          }
        } else {
          // 无预设类型名：从方法名推断（如方法名为 "Update"，则类型名为 "Update"）
          console.log(`尝试从方法名 ${methodName} 推断类型名`);

          // 检查文件中是否有同名消息定义（如 "message Update {"）
          const messageRegex = new RegExp(`message\\s+${methodName}\\s*\\{`, 'i');
          if (messageRegex.test(content)) {
            console.log(`在文件中找到消息类型 ${methodName} 的定义`);
            // 拼接包名前缀（如果有文件定义的包名）
            const packageMatch = content.match(/package\s+([^;]+);/);
            const packagePrefix = packageMatch ? packageMatch[1].trim() : '';
            finalTypeName = packagePrefix ? `${packagePrefix}.${methodName}` : methodName;
          } else {
            console.log(`在文件中未找到消息类型 ${methodName} 的定义`);
            // 尝试从文件包名推断（如文件包名为 "actpb.act0152pb"，则类型名为 "actpb.act0152pb.MethodName"）
            const packageMatch = content.match(/package\s+([^;]+);/);
            if (packageMatch) {
              const filePackage = packageMatch[1].trim();
              console.log(`文件中定义的包名: ${filePackage}`);
              finalTypeName = `${filePackage}.${methodName}`;
            } else {
              // 文件无包名定义，直接拼接调用包名和方法名（兼容极端情况）
              finalTypeName = packageName.includes('.') ? `${packageName}.${methodName}` : methodName;
            }
          }
        }
      }

      console.log(`确定的类型名: ${finalTypeName}`);
      return { file: filePath, typeName: finalTypeName }; // 返回文件路径和类型名（关键输出）
    }

    /**
     * 辅助函数：在目标文件夹中匹配 proto 文件（优先文件名匹配，其次内容匹配）
     * @description 提供多层匹配策略，确保尽可能找到目标 proto 文件：
     *              1. 精确匹配文件名（如 "act0152pb.proto"）
     *              2. 去掉 "pb" 后缀匹配（如 "act0152.proto"）
     *              3. 内容匹配（根据服务名或类型名匹配文件内容）
     * @param {string[]} files - 目标文件夹下的所有文件名（用于筛选）
     * @param {string} targetFolder - 目标文件夹名（如 "act0152pb"，辅助匹配）
     * @param {string} serviceName - 服务名（服务调用场景，用于匹配服务定义）
     * @param {string} fullPath - 目标文件夹完整路径（用于拼接文件绝对路径）
     * @param {string} typeName - 类型名（非服务调用场景，用于匹配消息/枚举定义）
     * @returns {string|null} 匹配的 proto 文件名，找不到返回 null
     */
    function findProtoFile(files, targetFolder, serviceName, fullPath, typeName) {
      // 策略1：优先匹配同名 proto 文件（如 "act0152pb.proto"，最直接的匹配方式）
      const exactMatch = files.find(file => file === `${targetFolder}.proto`);
      if (exactMatch) {
        console.log(`找到精确匹配的proto文件: ${exactMatch}`);
        return exactMatch;
      }

      // 策略2：尝试去掉 "pb" 后缀匹配（如 "act0152.proto"）
      const withoutPb = targetFolder.replace(/_?pb$/i, "");
      if (withoutPb && withoutPb !== targetFolder) {
        const pbMatch = files.find(file => file === `${withoutPb}.proto`);
        if (pbMatch) {
          console.log(`找到去掉pb后缀的proto文件: ${pbMatch}`);
          return pbMatch;
        }
      }

      // 策略3：按文件内容匹配（服务调用或非服务调用场景）
      const protoFiles = files.filter(file => file.endsWith('.proto')); // 过滤出所有 proto 文件

      if (serviceName) { // 服务调用场景：查找包含服务名的文件（如 "service CSAct0152Service"）
        console.log(`按文件名未匹配到，尝试通过文件内容查找服务: ${serviceName}`);
        for (const file of protoFiles) {
          try {
            const filePath = path.join(fullPath, file);
            const content = fs.readFileSync(filePath, 'utf8');
            // 检查文件内容是否包含服务名定义
            if (content.includes(`service ${serviceName}`) || content.includes(`${serviceName} {`)) {
              console.log(`通过文件内容匹配到服务 ${serviceName} 在文件 ${file} 中`);
              return file;
            }
          } catch (err) {
            console.error(`读取文件 ${file} 失败: ${err.message}`);
          }
        }
      } else if (typeName) { // 非服务调用场景：查找包含类型名的文件（如 "message UpdateNTF {"）
        console.log(`按文件名未匹配到，尝试通过文件内容查找类型: ${typeName}`);
        for (const file of protoFiles) {
          try {
            const filePath = path.join(fullPath, file);
            const content = fs.readFileSync(filePath, 'utf8');
            // 正则匹配类型定义（消息或枚举）
            const typePattern = new RegExp(`(message|enum)\\s+${typeName}\\s*\\{`, 'i');
            if (typePattern.test(content)) {
              console.log(`通过文件内容匹配到类型 ${typeName} 在文件 ${file} 中`);
              return file;
            }
          } catch (err) {
            console.error(`读取文件 ${file} 失败: ${err.message}`);
          }
        }
      } else {
        console.log(`无法进行内容匹配: 服务名和类型名都为空`);
      }

      // 所有策略失败，返回 null
      console.log(`未找到匹配的proto文件，已尝试文件名和内容匹配`);
      return null;
    }

    // 开始查找
    const result = findTargetFolder(baseDir);

    if (!result) {
      console.warn(`未找到包 ${packageName} 的proto文件或无法确定类型名`);

      // 在根目录中搜索文件的内容
      const items = fs.readdirSync(baseDir).filter(item => item.endsWith('.proto'));
      console.log(`检查根目录中的proto文件: ${items.join(', ')}`);

      for (const item of items) {
        const filePath = path.join(baseDir, item);
        try {
          const content = fs.readFileSync(filePath, 'utf8');

          // 区分服务调用和非服务调用场景
          if (serviceName) {
            // 服务调用场景
            // 检查是否包含服务名
            if (content.includes(`service ${serviceName}`) ||
                content.includes(`${serviceName} {`)) {

              console.log(`在根目录找到包含服务 ${serviceName} 的文件: ${item}`);

              // 查找方法定义
              const methodRegex = new RegExp(`rpc\\s+${methodName}\\s*\\(\\s*([^\\)]+)\\s*\\)\\s*returns\\s*\\(\\s*([^\\)]+)\\s*\\)`, 'i');
              const match = content.match(methodRegex);

              if (match) {
                const requestType = match[1].trim();
                const responseType = match[2].trim();

                console.log(`找到方法定义: rpc ${methodName}(${requestType}) returns (${responseType})`);

                // 确定包名
                const packageMatch = content.match(/package\s+([^;]+);/);
                const packagePrefix = packageMatch ? packageMatch[1].trim() : '';

                // 根据resType确定类型名
                const finalTypeName = resType === 1
                  ? (requestType.includes('.') ? requestType : `${packagePrefix}.${requestType}`)
                  : (responseType.includes('.') ? responseType : `${packagePrefix}.${responseType}`);

                return {
                  file: filePath,
                  typeName: finalTypeName
                };
              }
            }
          } else if (typeName) {
            // 非服务调用场景，查找包含指定类型的文件
            const typePattern = new RegExp(`(message|enum)\\s+${typeName}\\s*\\{`, 'i');
            if (typePattern.test(content)) {
              console.log(`在根目录找到包含类型 ${typeName} 的文件: ${item}`);

              // 确定包名
              const packageMatch = content.match(/package\s+([^;]+);/);
              const packagePrefix = packageMatch ? packageMatch[1].trim() : '';

              return {
                file: filePath,
                typeName: packagePrefix ? `${packagePrefix}.${typeName}` : typeName
              };
            }
          }
        } catch (err) {
          console.error(`读取文件 ${filePath} 失败: ${err.message}`);
        }
      }
    }

    console.log(`======== 查找包路径结束 ========`);
    return result;
  } catch (error) {
    console.error(`查找proto文件失败: ${error.message}`);
    console.error(error.stack);
    return null;
  }
}

/**
 * 将Base64编码的protobuf数据转换为JSON对象
 * @param {string} protoFilePath - proto文件路径
 * @param {string} base64 - base64编码的protobuf数据
 * @param {string} typeName - 消息类型名称
 * @returns {Promise<Object>} 解析后的JSON对象
 */
async function convertBase64ToJson(protoFilePath, base64, typeName) {
  try {
    // 验证输入参数
    if (!protoFilePath || !base64 || !typeName) {
      throw new AppError(400, `无效的输入参数: 文件路径=${!!protoFilePath}, base64=${!!base64}, 类型名=${typeName}`);
    }

    console.log(`解析参数: 文件=${protoFilePath}, 类型名=${typeName}`);
    console.log(`base64数据长度: ${base64.length}`);

    // 将Base64字符串转换为Buffer
    const buffer = Buffer.from(base64, "base64");
    console.log(`解码后buffer长度: ${buffer.length}字节`);

    // 确保Proto目录路径正确
    const protoDir = path.join(__dirname, "..", "..", "Proto");

    // 检查缓存中是否已有加载好的Root实例
    const cacheKey = protoFilePath;
    let root;

    if (rootCache.has(cacheKey)) {
      root = rootCache.get(cacheKey);
      console.log(`使用缓存的proto文件: ${cacheKey}`);
    } else {
      // 创建一个新的Root实例
      root = new protobuf.Root();
      console.log(`加载新的proto文件: ${cacheKey}`);

      // 设置包含目录，用于解析import语句
      root.resolvePath = function (origin, target) {
        // 处理相对路径
        if (target.startsWith(".")) {
          return path.resolve(path.dirname(origin), target);
        }

        // 尝试在不同目录中查找目标文件
        const searchDirs = [
          path.dirname(origin),
          protoDir,
          path.join(protoDir, "pkg"),
          path.join(protoDir, "pkg", "proto"),
          path.dirname(protoFilePath),
          path.join(protoDir, "google", "protobuf"),
          path.join(protoDir, "corepb"),
          path.join(protoDir, "clientpb"),
        ];

        for (const dir of searchDirs) {
          const fullPath = path.join(dir, target);
          if (fs.existsSync(fullPath)) {
            return fullPath;
          }
        }

        // 如果找不到，返回原始目标路径
        return target;
      };

      // 加载proto文件
      try {
        await root.load(protoFilePath, {
          keepCase: true,
          alternateCommentMode: true,
          preferTrailingComment: true,
        });

        // 将加载好的Root实例缓存起来
        rootCache.set(cacheKey, root);
      } catch (error) {
        throw new AppError(400, `Proto文件加载失败: ${error.message}`);
      }
    }

    try {
      console.log(`查找类型: ${typeName}`);
      // 查找消息类型并解码
      const Response = root.lookupType(typeName);
      const decoded = Response.decode(buffer);
      console.log(`成功解码数据`);

      // 转换为纯JavaScript对象并返回
      return Response.toObject(decoded, {
        defaults: true,
        arrays: true,
        objects: true,
        longs: String,
        enums: String,
        bytes: String,
      });
    } catch (error) {
      console.error(`类型 ${typeName} 解码失败: ${error.message}`);

      // 尝试列出可用的类型进行智能匹配
      console.log(`尝试智能匹配类型...`);
      const allTypes = [];
      const typesToTry = [];

      // 收集所有可用的类型
      try {
        root.nestedArray.forEach(obj => {
          if (obj instanceof protobuf.Type) {
            allTypes.push(obj.fullName);

            // 检查类型名相似度
            if (obj.fullName.includes(typeName.split('.').pop()) ||
                typeName.includes(obj.name)) {
              typesToTry.push(obj.fullName);
            }
          }
        });

        console.log(`找到 ${allTypes.length} 个类型，尝试匹配的类型: ${typesToTry.join(', ')}`);
      } catch (e) {
        console.error(`无法列出类型: ${e.message}`);
      }

      // 尝试使用相似的类型名解码
      for (const typeToTry of typesToTry) {
        try {
          console.log(`尝试使用类型 ${typeToTry} 解码`);
          const AltResponse = root.lookupType(typeToTry);
          const decoded = AltResponse.decode(buffer);
          console.log(`使用类型 ${typeToTry} 成功解码数据`);

          // 转换为纯JavaScript对象并返回
          return AltResponse.toObject(decoded, {
            defaults: true,
            arrays: true,
            objects: true,
            longs: String,
            enums: String,
            bytes: String,
          });
        } catch (e) {
          console.log(`类型 ${typeToTry} 解码失败: ${e.message}`);
        }
      }

      // 如果所有尝试都失败，抛出原始错误
      if (allTypes.length > 0) {
        throw new AppError(400, `解码失败: ${error.message}, 可用的类型: ${allTypes.slice(0, 10).join(', ')}${allTypes.length > 10 ? '...' : ''}`);
      } else {
        throw new AppError(400, `解码失败: ${error.message}, 没有找到可用的类型`);
      }
    }
  } catch (error) {
    console.error("解析失败:", error);
    throw new AppError(400, `解析失败: ${error.message}`);
  }
}

/**
 * 解析sendStr格式的请求
 * 旧格式: packageIndex, packageName, methodName, ..., base64Data
 * 新格式: [timestamp] packageIndex, packageName, methodName, ..., base64Data
 * 例如: [34031872.000000]        2, actpb.actbasepb.CSActService, ActEntranceDetail, 58, 74, 0:        base64Data
 * 非服务格式: 3, zonepb.pvppb.ascensionpb.UpdateNTF, Push, 0, 389, 0: base64Data
 */
router.post("/proto/submit", async (req, res, next) => {
  try {
    const { sendStr } = req.body;

    if (!sendStr) {
      throw new AppError(400, "缺少sendStr参数");
    }

    console.log(`收到请求: ${sendStr.substring(0, 100)}${sendStr.length > 100 ? '...' : ''}`);

    // 初始化变量
    let headerPart;
    let timestamp = null;

    // 检查是否是新格式（带有时间戳）
    const timestampMatch = sendStr.match(/^\s*\[([\d\.]+)\]\s*/);
    let processedStr = sendStr;

    // 如果找到时间戳格式，提取时间戳并移除这部分
    if (timestampMatch) {
      timestamp = parseFloat(timestampMatch[1]);
      // 移除时间戳部分，保留剩余字符串
      processedStr = sendStr.substring(timestampMatch[0].length);
      console.log(`提取到时间戳: ${timestamp}`);
    }

    // 标准化字符串，将制表符替换为空格
    processedStr = processedStr.replace(/\t/g, ' ');

    // 解析sendStr字符串
    const colonIndex = processedStr.indexOf(":");
    if (colonIndex === -1) {
      throw new AppError(400, "sendStr格式不正确，缺少冒号分隔符");
    }

    // 提取冒号前的部分并按逗号分割
    headerPart = processedStr.substring(0, colonIndex).trim();
    console.log(`提取头部: ${headerPart}`);

    const parts = headerPart.split(",").map((part) => part.trim());

    if (parts.length < 3) {
      throw new AppError(400, "sendStr格式不正确，缺少必要参数");
    }

    // 提取协议类型、包名和方法名
    const resType = parseInt(parts[0], 10);
    let packageName = parts[1]; // 例如: actpb.act0152pb.CSAct0152Service 或 zonepb.pvppb.ascensionpb.UpdateNTF
    let methodName = parts[2]; // 例如: GameEnd 或 Push

    // 检查是否是非服务调用格式: zonepb.pvppb.ascensionpb.UpdateNTF, Push
    // 这种格式下，UpdateNTF是类型名，不是路径的一部分
    let typeName = null;
    if (!packageName.includes('Service')) {
      // 检查包名最后一部分是否可能是类型名
      const packageParts = packageName.split('.');
      const lastPart = packageParts[packageParts.length - 1];

      // 判断特征：如果最后一部分是大写开头或包含大写字母，可能是类型名
      const isTypeName = /[A-Z]/.test(lastPart);

      if (isTypeName) {
        console.log(`检测到非服务调用格式，最后部分 ${lastPart} 可能是类型名`);

        // 将最后一部分识别为类型名
        typeName = lastPart;

        // 可选：如果方法名是Push，这是一个典型的通知模式，可以给出额外日志
        if (methodName === 'Push') {
          console.log(`检测到通知(Push)模式，类型名: ${typeName}`);
        }
      }
    }

    console.log(`协议类型: ${resType}`);
    console.log(`包名: ${packageName}`);
    console.log(`方法名: ${methodName}`);
    if (typeName) console.log(`解析的类型名: ${typeName}`);

    // 提取base64数据（冒号后的所有内容）
    const base64Data = processedStr.substring(colonIndex + 1).trim();
    console.log(`base64数据长度: ${base64Data.length}`);

    // 查找proto文件和类型名
    const protoInfo = findProtoFileByPackage(packageName, methodName, resType, typeName);

    if (!protoInfo) {
      throw new AppError(404, `未找到包 ${packageName} 方法 ${methodName} 的proto文件或类型`);
    }

    console.log(`找到proto文件: ${protoInfo.file}`);
    console.log(`确定的类型名: ${protoInfo.typeName}`);

    // 解析base64数据
    const jsonResult = await convertBase64ToJson(
      protoInfo.file,
      base64Data,
      protoInfo.typeName
    );

    // 使用统一响应格式返回结果
    return ResponseHelper.success(
      res,
      {
        timestamp, // 添加时间戳到返回结果
        packageName,
        methodName,
        resType,
        protoFile: protoInfo.file,
        typeName: protoInfo.typeName,
        result: jsonResult,
      },
      "解析成功"
    );
  } catch (error) {
    console.error("路由处理失败:", error);
    next(error);
  }
});

module.exports = router;
