#!/bin/bash

# 编译libshoco.so文件的脚本
# 在Linux服务器上运行此脚本来生成正确的libshoco.so文件

set -e  # 出错时立即退出
set -x  # 显示执行的命令

echo "====== 开始编译libshoco.so ======"

# 获取脚本所在目录的绝对路径
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
echo "脚本目录: $SCRIPT_DIR"

# 进入shoco目录
cd "$SCRIPT_DIR/shoco"
echo "当前目录: $(pwd)"

# 检查源文件是否存在
if [ ! -f "shoco.c" ]; then
    echo "错误: shoco.c 文件不存在!"
    exit 1
fi

if [ ! -f "shoco.h" ]; then
    echo "错误: shoco.h 文件不存在!"
    exit 1
fi

# 显示编译环境信息
echo "====== 编译环境信息 ======"
gcc --version
echo "====== 编译环境信息结束 ======"

# 清理旧文件
if [ -f "../libshoco.so" ]; then
    echo "删除旧的 libshoco.so 文件"
    rm -f "../libshoco.so"
fi

# 编译共享库
echo "执行编译命令..."
gcc -std=c99 -O3 -Wall -fPIC -shared shoco.c -o ../libshoco.so -I.

# 检查编译结果
if [ $? -eq 0 ] && [ -f "../libshoco.so" ]; then
    echo "编译成功!"
    # 设置权限
    chmod 755 "../libshoco.so"
    echo "libshoco.so 文件大小: $(ls -lh ../libshoco.so | awk '{print $5}')"
    echo "libshoco.so 文件权限: $(ls -la ../libshoco.so | awk '{print $1}')"

    # 验证库文件
    echo "验证库文件..."
    ldd "../libshoco.so" || echo "无法验证库依赖，但这可能是正常的"

    echo "====== 编译完成，libshoco.so 已成功生成 ======"
else
    echo "编译失败!"
    exit 1
fi