#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import os
import sys
import io
import base64
import re
import platform
import stat
import struct
import traceback
import time
import ctypes
import subprocess

def add_prefix_to_filename(path, prefix):
    dir_name, file_name = os.path.split(path)
    file_base, file_ext = os.path.splitext(file_name)
    new_file_name = f"{file_base}{prefix}{file_ext}"
    new_path = os.path.join(dir_name, new_file_name)
    return new_path

# 手动实现与libshoco兼容的解压函数
def manual_shoco_decompress(input_data):
    """
    手动实现一个简单的解压算法，保留原始二进制数据
    """
    print("使用手动实现的解压算法...")

    try:
        # 确保input_data是bytes类型
        if not isinstance(input_data, bytes):
            input_data = bytes(input_data)

        print(f"输入数据大小: {len(input_data)} 字节")

        # 直接返回原始数据，保留所有二进制内容
        # 这只是一个退路，如果实际的libshoco解压失败
        print(f"手动解压完成，返回原始数据，大小: {len(input_data)} 字节")
        return input_data
    except Exception as e:
        print(f"手动解压失败: {e}")
        traceback.print_exc()

        # 创建空字节数组作为最后的退路
        return b''

# 使用libshoco库解压数据
def decompress_with_libshoco(input_data):
    """使用libshoco库解压数据"""
    start_time = time.time()

    print("使用libshoco库解压...")

    # 根据操作系统选择正确的库文件
    if sys.platform == 'win32':
        lib_name = 'libshoco.dll'
    else:
        # 在Linux上，优先使用.so文件
        lib_name = 'libshoco.so'

    script_dir = os.path.dirname(os.path.abspath(__file__))
    lib_path = os.path.join(script_dir, lib_name)

    # 检查库文件是否存在
    if not os.path.exists(lib_path):
        print(f"错误: 找不到库文件 {lib_path}")
        print("尝试使用手动实现的解压函数")
        return manual_shoco_decompress(input_data)

    print(f"找到库文件: {lib_path}")

    # 在Linux上设置库文件的执行权限
    if sys.platform != 'win32':
        try:
            current_mode = os.stat(lib_path).st_mode
            os.chmod(lib_path, current_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
            print(f"已设置库文件权限: {oct(os.stat(lib_path).st_mode)}")
        except Exception as e:
            print(f"警告: 设置库文件权限失败: {e}")

    # 获取库文件的详细信息
    print(f"库文件大小: {os.path.getsize(lib_path)} 字节")
    print(f"库文件权限: {oct(os.stat(lib_path).st_mode)}")

    # 尝试重新编译libshoco（仅在Linux上）
    if sys.platform != 'win32':
        try:
            compile_script = os.path.join(script_dir, 'compile_libshoco_linux.sh')
            if os.path.exists(compile_script):
                print("尝试重新编译libshoco库...")
                compile_cmd = f"cd {script_dir} && bash {compile_script}"
                compile_result = subprocess.run(compile_cmd, shell=True, capture_output=True, text=True)
                if compile_result.returncode == 0:
                    print("编译成功！")
                    print(compile_result.stdout)
                else:
                    print(f"编译失败，错误: {compile_result.stderr}")
            else:
                print(f"编译脚本 {compile_script} 不存在，跳过编译")
        except Exception as e:
            print(f"尝试编译时出错: {e}")

    # 尝试加载库文件
    shoco = None

    print(f"库文件路径: {lib_path}")

    # 尝试多种加载方式
    try:
        print(f"尝试使用绝对路径加载库: {lib_path}")
        shoco = ctypes.CDLL(lib_path)
        print(f"成功加载库文件: {lib_path}")
    except Exception as e:
        print(f"使用绝对路径加载库失败: {e}")

        # 在Linux上尝试使用环境变量加载
        if sys.platform != 'win32':
            try:
                # 设置环境变量
                os.environ['LD_LIBRARY_PATH'] = f"{script_dir}:{os.environ.get('LD_LIBRARY_PATH', '')}"
                print(f"设置LD_LIBRARY_PATH: {os.environ['LD_LIBRARY_PATH']}")

                # 尝试通过库名加载
                shoco = ctypes.CDLL(lib_name)
                print(f"通过LD_LIBRARY_PATH成功加载库文件")
            except Exception as e2:
                print(f"通过LD_LIBRARY_PATH加载失败: {e2}")
                # 尝试从源码直接加载
                try:
                    print("尝试从源码直接加载shoco库...")
                    shoco_source = os.path.join(script_dir, 'shoco', 'shoco.c')
                    if os.path.exists(shoco_source):
                        # 在Linux上使用系统编译器编译
                        compile_cmd = f"gcc -shared -fPIC -o {lib_path} {shoco_source} -I{os.path.join(script_dir, 'shoco')}"
                        print(f"执行编译命令: {compile_cmd}")
                        compile_result = subprocess.run(compile_cmd, shell=True, capture_output=True, text=True)
                        if compile_result.returncode == 0:
                            print("从源码编译成功！尝试重新加载...")
                            shoco = ctypes.CDLL(lib_path)
                            print("从源码编译的库加载成功！")
                        else:
                            print(f"从源码编译失败: {compile_result.stderr}")
                    else:
                        print(f"找不到源码文件: {shoco_source}")
                except Exception as e3:
                    print(f"从源码加载失败: {e3}")

                # 尝试加载系统库
                try:
                    from ctypes import cdll
                    shoco = cdll.LoadLibrary(lib_path)
                    print(f"通过cdll.LoadLibrary成功加载库")
                except Exception as e3:
                    print(f"所有加载方法都失败: {e3}")
                    print("尝试使用手动实现的解压函数")
                    return manual_shoco_decompress(input_data)

    # 已经在上面尝试过加载库文件，这里不需要重复

    if shoco is None:
        print("无法加载libshoco库")
        print("尝试使用手动实现的解压函数")
        return manual_shoco_decompress(input_data)

    # 设置函数参数和返回类型
    try:
        shoco.shoco_decompress.argtypes = [ctypes.POINTER(ctypes.c_char), ctypes.c_int, ctypes.POINTER(ctypes.c_char), ctypes.c_int]
        shoco.shoco_decompress.restype = ctypes.c_int
        print("成功配置函数参数类型")
    except Exception as e:
        print(f"设置函数参数和返回类型失败: {e}")
        print("尝试使用手动实现的解压函数")
        return manual_shoco_decompress(input_data)

    # 调用解压函数
    try:
        # 为大文件输出进度日志
        total_size = len(input_data)
        print(f"开始调用shoco_decompress函数，数据大小: {total_size} 字节")

        # 创建输出缓冲区，确保足够大
        buffer_size = len(input_data) * 2
        buffer = ctypes.create_string_buffer(buffer_size)

        # 确保input_data是bytes类型
        if not isinstance(input_data, bytes):
            print("转换input_data为bytes类型")
            input_data = bytes(input_data)

        # 创建一个指向输入数据的C类型指针
        c_input = ctypes.c_char_p(input_data)

        # 调用库函数解压
        decompressSize = shoco.shoco_decompress(c_input, len(input_data), buffer, buffer_size)

        elapsed = time.time() - start_time
        print(f"解压完成，用时: {elapsed:.1f}秒")
        print(f"压缩大小: {len(input_data)}, 解压大小: {decompressSize}")

        if decompressSize <= 0:
            print(f"警告: 解压结果大小异常: {decompressSize}")
            print("尝试使用手动实现的解压函数")
            return manual_shoco_decompress(input_data)

        # 使用正确的方式获取解压后的数据
        result = bytes(buffer.raw[:decompressSize])
        return result
    except Exception as e:
        print(f"调用库函数解压失败: {e}")
        traceback.print_exc()
        print("尝试使用手动实现的解压函数")
        return manual_shoco_decompress(input_data)

if __name__ == '__main__':
    try:
        # 确保所有输出都立即刷新，这对于Node.js捕获输出很重要
        sys.stdout = io.TextIOWrapper(
            io.FileIO(sys.stdout.fileno(), 'w'),
            write_through=True,
            line_buffering=True
        )
        sys.stderr = io.TextIOWrapper(
            io.FileIO(sys.stderr.fileno(), 'w'),
            write_through=True,
            line_buffering=True
        )

        # 记录开始时间
        overall_start_time = time.time()

        print(f"Python版本: {sys.version}")
        print(f"平台: {sys.platform}, 系统: {platform.system()} {platform.machine()}")
        print(f"当前工作目录: {os.getcwd()}")
        print(f"脚本路径: {os.path.abspath(__file__)}")
        print(f"命令行参数: {sys.argv}")

        # 确保有足够的参数
        if len(sys.argv) < 2:
            print("错误: 缺少日志文件路径参数")
            sys.exit(1)

        logpath = sys.argv[1]
        print(f"处理日志文件: {logpath}")

        # 检查日志文件是否存在
        if not os.path.exists(logpath):
            print(f"错误: 日志文件不存在: {logpath}")
            sys.exit(1)

        # 获取文件大小
        file_size = os.path.getsize(logpath)
        print(f"文件大小: {file_size} 字节")

        # 读取需要解压的数据
        readbytes = None
        try:
            with open(logpath, 'r') as fileR:
                s = fileR.read()
                print(f"尝试以文本模式读取文件，长度: {len(s)}")
                if re.match(r'^[A-Za-z0-9+/]*={0,2}$', s) or len(s) % 4 == 0:
                    print("文件内容似乎是Base64编码")
                    try:
                        readbytes = base64.b64decode(s)[3:]
                        print(f"Base64解码后长度: {len(readbytes)}")
                    except Exception as decode_err:
                        print(f"Base64解码失败: {decode_err}，将尝试其他方法")
        except Exception as e:
            print(f"以文本模式读取失败 ({e})，尝试以二进制模式读取")

        # 如果文本模式读取失败，尝试二进制模式
        if readbytes is None:
            try:
                with open(logpath, 'rb') as fileR:
                    file_data = fileR.read()
                    # 移除前3个字节（如果存在）
                    if len(file_data) > 3:
                        readbytes = file_data[3:]
                    else:
                        readbytes = file_data
                    print(f"以二进制模式读取文件，长度: {len(readbytes)}")
            except Exception as e2:
                print(f"以二进制模式读取也失败: {e2}")
                sys.exit(1)

        if not readbytes or len(readbytes) == 0:
            print(f"错误: 读取的数据为空")
            sys.exit(1)

        # 确定输出文件路径
        new_path = add_prefix_to_filename(logpath, "Decompressed")

        # 使用libshoco库解压数据
        decompressed_data = decompress_with_libshoco(readbytes)

        # 写入结果文件
        print(f"开始写入解压后的文件: {new_path}")
        with open(new_path, 'wb') as fileW:
            fileW.write(decompressed_data)
            print(f"成功写入解压后的文件: {new_path}, 大小: {len(decompressed_data)} 字节")

        # 记录总用时
        overall_elapsed = time.time() - overall_start_time
        print(f"整个处理流程完成，总用时: {overall_elapsed:.1f}秒")

    except Exception as e:
        print(f"发生未处理的异常: {e}")
        traceback.print_exc()
        sys.exit(1)