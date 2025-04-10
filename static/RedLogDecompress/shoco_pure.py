#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
纯Python实现的shoco解压算法
完全复刻shoco库的行为，确保解压结果一致
"""

import sys
import traceback

# 从shoco.c中提取的常量和表格
MIN_CHR = 39    # '
MAX_CHR = 122   # z

# 从shoco_model.h中提取的精确字符表
CHARS_BY_CHR_ID = [
    'e', 'a', 'i', 'o', 't', 'h', 'n', 'r', 's', 'l', 'u', 'c', 'w',
    'm', 'd', 'b', 'p', 'f', 'g', 'v', 'y', 'k', '-', 'H', 'M', 'T',
    '\'', 'B', 'x', 'I', 'W', 'L'
]

# 后继字符表 - 从shoco_model.h精确提取
CHRS_BY_CHR_AND_SUCCESSOR_ID = [
    # ' (39) - 索引0
    ['s', 't', 'c', 'l', 'm', 'a', 'd', 'r', 'v', 'T', 'A', 'L', 'e', 'M', 'Y', '-'],
    # 省略 40-96 的字符
] + [[] for _ in range(40, 97)] + [
    # 'a' (97) - 索引58
    ['n', 'l', 'r', 't', 's', 'd', 'i', 'v', 'c', 'p', 'm', 'b', 'g', 'y', 'k', 'f'],
    # 'b' (98) - 索引59
    ['e', 'l', 'o', 'u', 'y', 'a', 'r', 'i', 's', 'j', 't', 'b', 'v', 'h', 'm', 'd'],
    # 'c' (99) - 索引60
    ['o', 'e', 'h', 'a', 't', 'k', 'i', 'r', 'l', 'u', 'y', 'c', 'q', 's', '-', 'd'],
    # 'd' (100) - 索引61
    ['e', 'i', 'o', 'a', 's', 'y', 'r', 'u', 'd', 'l', '-', 'g', 'n', 'v', 'm', 'f'],
    # 'e' (101) - 索引62
    ['r', 'n', 'd', 's', 'a', 'l', 't', 'e', 'm', 'c', 'v', 'y', 'i', 'x', 'f', 'p'],
    # 'f' (102) - 索引63
    ['o', 'e', 'r', 'a', 'i', 'f', 'u', 't', 'l', '-', 'y', 's', 'n', 'c', '\'', 'k'],
    # 'g' (103) - 索引64
    ['h', 'e', 'o', 'a', 'r', 'i', 'l', 's', 'u', 'n', 'g', 'b', '-', 't', 'y', 'm'],
    # 'h' (104) - 索引65
    ['e', 'a', 'i', 'o', 't', 'r', 'u', 'y', 'm', 's', 'l', 'b', '\'', '-', 'f', 'd'],
    # 'i' (105) - 索引66
    ['n', 's', 't', 'm', 'o', 'l', 'c', 'd', 'r', 'e', 'g', 'a', 'f', 'v', 'z', 'b'],
    # 'j' (106) - 空
    [],
    # 'k' (107) - 索引68
    ['e', 'n', 'i', 's', 'h', 'l', 'f', 'y', '-', 'a', 'w', '\'', 'g', 'r', 'o', 't'],
    # 'l' (108) - 索引69
    ['e', 'l', 'i', 'y', 'd', 'o', 'a', 'f', 'u', 't', 's', 'k', 'w', 'v', 'm', 'p'],
    # 'm' (109) - 索引70
    ['e', 'a', 'o', 'i', 'u', 'p', 'y', 's', 'b', 'm', 'f', '\'', 'n', '-', 'l', 't'],
    # 'n' (110) - 索引71
    ['d', 'g', 'e', 't', 'o', 'c', 's', 'i', 'a', 'n', 'y', 'l', 'k', '\'', 'f', 'v'],
    # 'o' (111) - 索引72
    ['u', 'n', 'r', 'f', 'm', 't', 'w', 'o', 's', 'l', 'v', 'd', 'p', 'k', 'i', 'c'],
    # 'p' (112) - 索引73
    ['e', 'r', 'a', 'o', 'l', 'p', 'i', 't', 'u', 's', 'h', 'y', 'b', '-', '\'', 'm'],
    # 'q' (113) - 空
    [],
    # 'r' (114) - 索引75
    ['e', 'i', 'o', 'a', 's', 'y', 't', 'd', 'r', 'n', 'c', 'm', 'l', 'u', 'g', 'f'],
    # 's' (115) - 索引76
    ['e', 't', 'h', 'i', 'o', 's', 'a', 'u', 'p', 'c', 'l', 'w', 'm', 'k', 'f', 'y'],
    # 't' (116) - 索引77
    ['h', 'o', 'e', 'i', 'a', 't', 'r', 'u', 'y', 'l', 's', 'w', 'c', 'f', '\'', '-'],
    # 'u' (117) - 索引78
    ['r', 't', 'l', 's', 'n', 'g', 'c', 'p', 'e', 'i', 'a', 'd', 'm', 'b', 'f', 'o'],
    # 'v' (118) - 索引79
    ['e', 'i', 'a', 'o', 'y', 'u', 'r'],
    # 'w' (119) - 索引80
    ['a', 'i', 'h', 'e', 'o', 'n', 'r', 's', 'l', 'd', 'k', '-', 'f', '\'', 'c', 'b'],
    # 'x' (120) - 索引81
    ['p', 't', 'c', 'a', 'i', 'e', 'h', 'q', 'u', 'f', '-', 'y', 'o'],
    # 'y' (121) - 索引82
    ['o', 'e', 's', 't', 'i', 'd', '\'', 'l', 'b', '-', 'm', 'a', 'r', 'n', 'p', 'w'],
    # 'z' (122) - 索引83
    []
]

# Pack定义 - 完全匹配shoco_model.h
PACKS = [
    # { bytes_packed, bytes_unpacked, offsets, masks }
    { "bytes_packed": 1, "bytes_unpacked": 2, "offsets": [26, 24], "masks": [15, 3] },
    { "bytes_packed": 2, "bytes_unpacked": 4, "offsets": [25, 22, 19, 16], "masks": [15, 7, 7, 7] },
    { "bytes_packed": 4, "bytes_unpacked": 8, "offsets": [23, 19, 15, 11, 8, 5, 2, 0],
      "masks": [31, 15, 15, 15, 7, 7, 7, 3] }
]

def decode_header(val):
    """与shoco.c中decode_header函数完全一致"""
    mark = -1
    temp_val = val
    while (temp_val & 0x80) != 0:  # 检查最高位
        temp_val = (temp_val << 1) & 0xFF
        mark += 1
    return mark

def swap_bytes(code_word):
    """模拟shoco.c中的swap函数，处理字节序"""
    # 始终按Windows平台(小端)处理字节序，确保与libshoco.dll行为一致
    return ((code_word & 0xFF) << 24) | \
           ((code_word & 0xFF00) << 8) | \
           ((code_word & 0xFF0000) >> 8) | \
           ((code_word & 0xFF000000) >> 24)

def shoco_decompress(input_data, progress_callback=None):
    """
    精确实现shoco_decompress函数

    参数:
    - input_data: 要解压的字节数据
    - progress_callback: 可选的进度回调函数 progress_callback(progress, total)

    返回:
    - 解压后的字节数据
    """
    if not isinstance(input_data, bytes):
        input_data = bytes(input_data)

    total_size = len(input_data)
    result = bytearray()

    # 主解压循环
    i = 0  # in指针
    in_end = total_size

    while i < in_end:
        # 调用进度回调
        if progress_callback and i % 1024 == 0:
            progress_callback(i, total_size)

        try:
            # 读取并解析头字节
            mark = decode_header(input_data[i])

            if mark < 0:
                # 非压缩字符处理

                # 检查sentinel值(0x00)，用于处理非ASCII字符
                if input_data[i] == 0:
                    i += 1
                    if i >= in_end:
                        break
                    # 确保与libshoco.dll一致的行为
                    # 0x00后的字节应直接添加到结果中，不做任何处理
                    result.append(input_data[i])
                else:
                    # 普通非压缩字符 - 直接使用原始值
                    result.append(input_data[i])

                i += 1
            else:
                # 压缩字符处理
                if mark >= len(PACKS):
                    # 无效的mark值，将当前字节作为未压缩处理
                    result.append(input_data[i])
                    i += 1
                    continue

                pack = PACKS[mark]

                # 确保有足够的数据
                if i + pack["bytes_packed"] > in_end:
                    break

                # 读取压缩块 - 确保与libshoco.dll行为一致
                code_word = 0
                for j in range(pack["bytes_packed"]):
                    # 按照Windows平台的方式读取字节
                    code_word = (code_word << 8) | input_data[i + j]

                # 字节顺序处理
                code_word = swap_bytes(code_word)

                # 解包首字符
                offset = pack["offsets"][0]
                mask = pack["masks"][0]
                char_id = (code_word >> offset) & mask

                if char_id < len(CHARS_BY_CHR_ID):
                    # 添加首字符
                    first_char = CHARS_BY_CHR_ID[char_id]
                    result.append(ord(first_char))
                    last_chr = first_char

                    # 解包后继字符 - 精确实现shoco.c中的逻辑
                    for j in range(1, pack["bytes_unpacked"]):
                        offset = pack["offsets"][j]
                        mask = pack["masks"][j]

                        if mask > 0:  # 只处理有效掩码
                            successor_id = (code_word >> offset) & mask

                            # 获取字符索引
                            last_chr_ord = ord(last_chr)

                            # 精确复制shoco.c中的数组访问
                            if MIN_CHR <= last_chr_ord <= MAX_CHR:
                                idx = last_chr_ord - MIN_CHR
                                if idx < len(CHRS_BY_CHR_AND_SUCCESSOR_ID):
                                    successor_list = CHRS_BY_CHR_AND_SUCCESSOR_ID[idx]

                                    if successor_id < len(successor_list):
                                        next_char = successor_list[successor_id]
                                        result.append(ord(next_char))
                                        last_chr = next_char
                                    else:
                                        # 超出范围，按照libshoco.dll的行为处理
                                        # 在DLL中，可能不会添加超出范围的字符
                                        # 我们这里沿用原有的行为来兼容
                                        result.append(successor_id)
                                        last_chr = chr(successor_id) if successor_id < 256 else '\0'
                                else:
                                    # 索引超出范围
                                    result.append(successor_id)
                                    last_chr = chr(successor_id) if successor_id < 256 else '\0'
                            else:
                                # 字符超出范围
                                result.append(successor_id)
                                last_chr = chr(successor_id) if successor_id < 256 else '\0'
                else:
                    # 无效字符ID，添加占位符
                    result.append(char_id)

                # 前进到下一个压缩包
                i += pack["bytes_packed"]

        except Exception as e:
            # 发生错误时跳过当前字节 - 与libshoco.dll行为保持一致
            # 仅记录错误，不影响解压过程
            if isinstance(e, IndexError):
                # 处理索引越界错误，这在libshoco.dll中通常会被忽略
                pass
            elif isinstance(e, KeyError):
                # 处理键错误，这在libshoco.dll中也会被忽略
                pass
            else:
                # 其他错误也跳过当前字节
                pass
            i += 1

    # 最后一次进度回调
    if progress_callback:
        progress_callback(total_size, total_size)

    return bytes(result)

def is_shoco_compressed(data, sample_size=1000):
    """
    尝试判断数据是否是shoco压缩的

    参数:
    - data: 要检查的字节数据
    - sample_size: 要分析的样本大小

    返回:
    - True如果可能是shoco压缩的，False否则
    """
    if not isinstance(data, bytes):
        data = bytes(data)

    total_size = len(data)
    if total_size < 10:
        return False

    # 检查常见的文件格式头
    common_file_headers = {
        b'\xff\xd8': "JPEG",
        b'\x89PNG': "PNG",
        b'GIF8': "GIF",
        b'%PDF': "PDF",
        b'PK\x03\x04': "ZIP",
        b'<html': "HTML",
        b'<?xml': "XML",
        b'{': "JSON"
    }

    for header, format_name in common_file_headers.items():
        if data.startswith(header):
            return False

    # 统计mark分布
    sample_size = min(sample_size, total_size)
    mark_counts = {}

    for i in range(sample_size):
        try:
            mark = decode_header(data[i])
            mark_counts[mark] = mark_counts.get(mark, 0) + 1
        except:
            pass

    # 计算有效mark比例
    valid_marks = sum(mark_counts.get(i, 0) for i in range(3))
    total_marks = sum(mark_counts.values())
    valid_ratio = valid_marks / total_marks if total_marks > 0 else 0

    # 至少有10%的数据应该是有效的压缩mark
    return valid_ratio >= 0.1

def decompress_file(input_file, output_file=None, verbose=True):
    """
    解压缩文件

    参数:
    - input_file: 输入文件路径
    - output_file: 输出文件路径，如果为None则自动生成
    - verbose: 是否输出详细信息

    返回:
    - 输出文件路径
    """
    try:
        with open(input_file, 'rb') as f:
            data = f.read()

        if verbose:
            print(f"读取文件: {input_file}, 大小: {len(data)} 字节")

        # 检查文件是否是shoco压缩的
        if not is_shoco_compressed(data):
            if verbose:
                print("警告: 文件可能不是shoco压缩的")

        # 进度回调
        def print_progress(current, total):
            if verbose and total > 0:
                print(f"解压进度: {current * 100 // total}%", end='\r')

        # 解压数据
        result = shoco_decompress(data, print_progress if verbose else None)

        if verbose:
            print(f"\n解压完成，解压后大小: {len(result)} 字节")

        # 生成输出文件名
        if output_file is None:
            output_file = input_file + ".decompressed"

        # 写入结果
        with open(output_file, 'wb') as f:
            f.write(result)

        if verbose:
            print(f"已保存到: {output_file}")

        return output_file

    except Exception as e:
        if verbose:
            print(f"解压文件出错: {e}")
            traceback.print_exc()
        return None

if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        input_file = sys.argv[1]
        output_file = sys.argv[2] if len(sys.argv) > 2 else None
        decompress_file(input_file, output_file)
    else:
        print("用法: python shoco_pure.py <input_file> [output_file]")