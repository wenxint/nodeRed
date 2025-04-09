#!/bin/bash

# 编译libshoco.so文件的脚本
# 在Linux服务器上运行此脚本来生成正确的libshoco.so文件

echo "开始编译libshoco.so..."

# 进入shoco目录
cd "$(dirname "$0")/shoco"

# 编译共享库
gcc -std=c99 -O3 -Wall -fPIC -shared shoco.c -o ../libshoco.so

echo "编译完成，libshoco.so已生成"
echo "请确保新生成的libshoco.so文件替换了原来的文件"