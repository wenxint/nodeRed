# Excel 文件处理 API 使用说明

## 概述

Excel 文件处理 API 提供了上传 Excel 文件并将其转换为 JSON 数组格式的功能。支持 `.xls`、`.xlsx` 和 `.xlsm` 格式的文件。

## API 端点

### 1. 上传并解析整个 Excel 文件

**端点**: `POST /excel/upload`

**功能**: 上传 Excel 文件并解析所有工作表，返回 JSON 数组格式的数据。

**请求参数**:
- `file` (必需): Excel 文件，通过 `multipart/form-data` 上传
- `options` (可选): 解析选项，JSON 字符串格式

**响应格式**:
```json
{
  "success": true,
  "message": "Excel 文件解析成功，共处理 2 个工作表，100 行数据",
  "data": {
    "fileName": "example.xlsx",
    "totalSheets": 2,
    "sheetNames": ["Sheet1", "Sheet2"],
    "sheets": {
      "Sheet1": {
        "index": 0,
        "name": "Sheet1",
        "data": [
          {"姓名": "张三", "年龄": 25, "城市": "北京"},
          {"姓名": "李四", "年龄": 30, "城市": "上海"}
        ],
        "stats": {
          "rowCount": 2,
          "columnCount": 3,
          "hasData": true
        }
      }
    },
    "fileInfo": {
      "originalName": "example.xlsx",
      "size": 12345,
      "uploadTime": "2024-01-01T12:00:00.000Z",
      "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    },
    "summary": {
      "totalSheets": 2,
      "totalRows": 100,
      "successfulSheets": 2,
      "failedSheets": 0
    }
  }
}
```

### 2. 解析指定工作表

**端点**: `POST /excel/parse-sheet`

**功能**: 上传 Excel 文件并只解析指定的工作表。

**请求参数**:
- `file` (必需): Excel 文件，通过 `multipart/form-data` 上传
- `sheetName` (必需): 要解析的工作表名称
- `options` (可选): 解析选项，JSON 字符串格式

**响应格式**:
```json
{
  "success": true,
  "message": "工作表 \"Sheet1\" 解析成功，共 50 行数据",
  "data": {
    "fileName": "example.xlsx",
    "sheetName": "Sheet1",
    "data": [
      {"姓名": "张三", "年龄": 25, "城市": "北京"}
    ],
    "stats": {
      "rowCount": 50,
      "columnCount": 3,
      "hasData": true
    },
    "availableSheets": ["Sheet1", "Sheet2", "Sheet3"]
  }
}
```

### 3. 获取 API 信息

**端点**: `GET /excel/info`

**功能**: 获取 API 使用说明和支持的功能。

## 解析选项 (options)

可以通过 `options` 参数自定义解析行为：

```json
{
  "useFirstRowAsHeader": true,
  "defaultValue": "",
  "includeBlankRows": false,
  "keepRawValues": false,
  "dateFormat": "yyyy-mm-dd"
}
```

**选项说明**:
- `useFirstRowAsHeader`: 是否使用第一行作为表头 (默认: true)
- `defaultValue`: 空单元格的默认值 (默认: "")
- `includeBlankRows`: 是否包含空行 (默认: false)
- `keepRawValues`: 是否保持原始值 (默认: false)
- `dateFormat`: 日期格式 (默认: "yyyy-mm-dd")

## 使用示例

### 基本上传示例 (JavaScript)

```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);

fetch('/excel/upload', {
  method: 'POST',
  body: formData
})
.then(response => response.json())
.then(data => {
  console.log('解析结果:', data);
})
.catch(error => {
  console.error('上传失败:', error);
});
```

### 带自定义选项的上传示例

```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('options', JSON.stringify({
  useFirstRowAsHeader: true,
  defaultValue: 'N/A',
  includeBlankRows: false,
  dateFormat: 'yyyy-mm-dd hh:mm:ss'
}));

fetch('/excel/upload', {
  method: 'POST',
  body: formData
})
.then(response => response.json())
.then(data => {
  console.log('解析结果:', data);
});
```

### 解析指定工作表示例

```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('sheetName', 'Sheet1');

fetch('/excel/parse-sheet', {
  method: 'POST',
  body: formData
})
.then(response => response.json())
.then(data => {
  console.log('工作表数据:', data.data.data);
});
```

### cURL 示例

```bash
# 基本上传
curl -X POST \
  -F "file=@example.xlsx" \
  http://localhost:3000/excel/upload

# 带选项的上传
curl -X POST \
  -F "file=@example.xlsx" \
  -F "options={\"useFirstRowAsHeader\":true,\"defaultValue\":\"N/A\"}" \
  http://localhost:3000/excel/upload

# 解析指定工作表
curl -X POST \
  -F "file=@example.xlsx" \
  -F "sheetName=Sheet1" \
  http://localhost:3000/excel/parse-sheet
```

## 限制和注意事项

1. **文件大小限制**: 最大支持 10MB 的 Excel 文件
2. **支持格式**: `.xls`、`.xlsx`、`.xlsm`
3. **内存使用**: 大文件可能消耗较多内存，建议分批处理大量数据
4. **临时文件**: 上传的文件会在处理完成后自动清理
5. **错误处理**: 如果某个工作表解析失败，其他工作表仍会继续处理

## 错误响应格式

```json
{
  "success": false,
  "message": "错误描述",
  "error": "详细错误信息"
}
```

## 常见错误

- `400`: 文件格式不支持、文件过大、参数错误
- `404`: 指定的工作表不存在
- `500`: 服务器内部错误

## 性能建议

1. 对于大文件，建议使用 `/excel/parse-sheet` 端点只解析需要的工作表
2. 合理设置解析选项，避免包含不必要的空行和空列
3. 如果只需要数据而不需要格式，设置 `keepRawValues: false`