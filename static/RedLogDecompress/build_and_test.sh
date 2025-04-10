#!/bin/bash

# 全面构建和测试RedLogDecompress功能的脚本
# 这个脚本会编译libshoco库，并测试解压功能

# 启用错误检测和命令回显
set -e
set -x

echo "====== RedLogDecompress 构建和测试脚本 ======"
echo "系统信息: $(uname -a)"
date

# 获取脚本所在目录的绝对路径
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"
echo "工作目录: $(pwd)"

# 编译libshoco库
echo "====== 第1步: 编译libshoco库 ======"
if [ -f "compile_libshoco_linux.sh" ]; then
    echo "使用现有的编译脚本"
    bash ./compile_libshoco_linux.sh
else
    echo "编译脚本不存在，创建一个新的"
    cat > compile_libshoco_linux.sh << 'EOF'
#!/bin/bash
set -e
set -x
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/shoco"
gcc -std=c99 -O3 -Wall -fPIC -shared shoco.c -o ../libshoco.so -I.
chmod 755 "../libshoco.so"
EOF
    chmod +x compile_libshoco_linux.sh
    bash ./compile_libshoco_linux.sh
fi

# 检查生成的库文件
if [ ! -f "libshoco.so" ]; then
    echo "错误: 编译未能生成libshoco.so文件"
    exit 1
fi

echo "libshoco.so 文件信息:"
ls -la libshoco.so
file libshoco.so

# 检查Python脚本
echo "====== 第2步: 检查Python脚本 ======"
if [ ! -f "RedLogDecompress.py" ]; then
    echo "错误: RedLogDecompress.py 不存在"
    exit 1
fi

# 设置Python脚本权限
chmod +x RedLogDecompress.py

# 检查Python环境
echo "Python版本:"
python3 --version || echo "python3 不可用，尝试使用python"
python --version || echo "python 不可用，请安装Python"

# 如果有测试文件，运行测试
echo "====== 第3步: 测试解压功能 ======"

# 创建简单的测试文件（如果不存在）
if [ ! -f "test_input.log" ]; then
    echo "创建测试输入文件..."
    echo "SGVsbG8gV29ybGQh" > test_input.log  # Base64编码的 "Hello World!"
fi

echo "运行Python脚本测试解压功能..."
python3 RedLogDecompress.py test_input.log || python RedLogDecompress.py test_input.log

# 检查测试结果
if [ -f "test_inputDecompressed.log" ]; then
    echo "测试成功! 解压文件内容:"
    cat test_inputDecompressed.log
    rm test_inputDecompressed.log
else
    echo "测试失败: 未生成解压文件"
    exit 1
fi

# 删除测试文件
rm -f test_input.log

echo "====== 所有步骤完成 ======"
echo "系统现在应该能够正确解压RedApp.log文件"
echo "完成时间: $(date)"