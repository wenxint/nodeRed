# RedLogDecompress 使用说明

## 功能说明

RedLogDecompress是一个用于解压RedApp.log文件的工具。它包含一个Python脚本和C语言编写的libshoco库，通过Node.js接口提供服务。

## 环境要求

- **Linux服务器**环境
- Python 3.6+
- gcc编译器
- Node.js 12+

## 问题说明

当在Linux服务器上运行RedLogDecompress.py脚本时，可能会遇到以下错误：

```
OSError: /path/to/libshoco.so: invalid ELF header
```

这个错误的原因是libshoco.so文件是在Windows系统下编译的，而不是在Linux系统下编译的。Windows编译的库文件使用PE格式，而Linux使用ELF格式，两者不兼容。

## 解决方法

我们提供了两种方法来解决这个问题：

### 方法1: 使用一键式脚本构建和测试（推荐）

1. 上传所有文件到Linux服务器
2. 给构建脚本添加执行权限：
   ```
   chmod +x build_and_test.sh
   ```
3. 运行构建脚本：
   ```
   ./build_and_test.sh
   ```
4. 脚本会自动完成以下步骤：
   - 编译libshoco.so库文件
   - 检查Python环境
   - 运行简单测试确保解压功能正常工作

### 方法2: 手动编译

1. 上传所有文件到Linux服务器
2. 给编译脚本添加执行权限：
   ```
   chmod +x compile_libshoco_linux.sh
   ```
3. 运行编译脚本：
   ```
   ./compile_libshoco_linux.sh
   ```
4. 脚本会在当前目录生成新的libshoco.so文件，替换原来的文件

## 使用方法

### 通过Node.js API使用

上传RedApp.log文件到服务器后，Node.js接口会自动调用Python脚本进行解压，并返回解压后的文件内容。

### 直接使用Python脚本

也可以直接在命令行中使用Python脚本：

```bash
python3 RedLogDecompress.py /path/to/RedApp.log
```

解压后的文件将被保存为 `/path/to/RedAppDecompressed.log`

## 调试信息

现在Python脚本的所有输出都会显示在Node.js控制台中，便于调试。如果遇到问题，请查看控制台输出的详细信息。

## 常见问题及解决方案

1. **找不到libshoco.so文件**
   - 确认文件路径是否正确
   - 运行 `compile_libshoco_linux.sh` 重新编译

2. **Python版本问题**
   - 确保使用Python 3.6+
   - 可能需要使用 `python3` 命令代替 `python`

3. **权限问题**
   - 给Python脚本和编译脚本添加执行权限：`chmod +x *.py *.sh`
   - 确保当前用户有权限访问和修改相关目录

4. **Node.js中看不到Python输出**
   - 确认RedLogDecompress.js中的spawn配置正确
   - 检查Python脚本中的输出缓冲区设置

## 技术支持

如有更多问题，请详细记录错误信息和环境信息，以便提供更准确的支持。