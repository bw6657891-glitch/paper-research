/**
 * server.js - 使用阿里云qwen-image-edit图像编辑模型（修复版）
 */

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const path = require("path");

const app = express();

// 中间件
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(__dirname)));

// API配置
const API_KEY = "sk-d924a601f99a41c5982cf444df447664";
const BASE_URL = "https://dashscope.aliyuncs.com/api/v1";

// 风格配置 - 优化提示词
const STYLE_CONFIGS = {
    "徽州生宣": {
        model: "qwen-image-edit-max", // 使用图像编辑模型
        positive_prompt: "将图片转换为中国传统水墨画风格，使用徽州生宣纸质感。墨色自然晕染，宣纸纹理清晰可见。保持原图的主体、构图和内容完全不变，只改变绘画风格和纸张纹理。",
        negative_prompt: "低质量，模糊，变形，不自然，现代风格，西方绘画，油画，水彩画，彩色照片，3D渲染"
    },
    "贵州皮纸": {
        model: "qwen-image-edit-max",
        positive_prompt: "将图片转换为中国传统水墨画风格，使用贵州皮纸质感。体现粗犷纤维纹理和枯笔飞白效果。保持原图的主体、构图和内容完全不变，只改变绘画风格和纸张纹理。",
        negative_prompt: "低质量，模糊，变形，不自然，现代风格，西方绘画，油画，水彩画，彩色照片，3D渲染，光滑表面"
    },
    "棠岙竹纸": {
        model: "qwen-image-edit-max",
        positive_prompt: "将图片转换为中国传统水墨画风格，使用棠岙竹纸质感。体现细腻竹纤维和温润米黄色纸面。保持原图的主体、构图和内容完全不变，只改变绘画风格和纸张纹理。",
        negative_prompt: "低质量，模糊，变形，不自然，现代风格，西方绘画，油画，水彩画，彩色照片，3D渲染，粗糙纹理"
    },
    "西北毛边": {
        model: "qwen-image-edit-max",
        positive_prompt: "将图片转换为中国传统水墨画风格，使用西北毛边纸质感。体现纸质松软和边缘自然毛糙感。保持原图的主体、构图和内容完全不变，只改变绘画风格和纸张纹理。",
        negative_prompt: "低质量，模糊，变形，不自然，现代风格，西方绘画，油画，水彩画，彩色照片，3D渲染，整齐边缘"
    }
};

// 健康检查
app.get("/api/health", (req, res) => {
    res.json({
        status: "运行中",
        service: "阿里云图像编辑API",
        model: "qwen-image-edit-max",
        timestamp: new Date().toISOString()
    });
});

// 提取base64
function extractBase64(dataUrl) {
    if (!dataUrl) return null;
    // 检查是否已经是完整的data URL格式
    if (dataUrl.startsWith("data:image/")) {
        return dataUrl; // 已经是完整的data URL
    }
    // 否则假设是纯base64，添加前缀
    return `data:image/jpeg;base64,${dataUrl}`;
}

// 主图像处理接口
app.post("/api/image-edit", async (req, res) => {
    console.log("\n=== 收到图像编辑请求 ===");
    
    try {
        const { style_name, image_base64 } = req.body;
        
        // 验证参数
        if (!style_name || !STYLE_CONFIGS[style_name]) {
            return res.status(400).json({
                success: false,
                error: "无效的风格选择",
                available_styles: Object.keys(STYLE_CONFIGS)
            });
        }
        
        if (!image_base64) {
            return res.status(400).json({
                success: false,
                error: "请上传图片"
            });
        }
        
        const styleConfig = STYLE_CONFIGS[style_name];
        console.log(`处理风格: ${style_name}, 使用模型: ${styleConfig.model}`);
        
        // 准备图像数据（确保是完整的data URL）
        const imageData = extractBase64(image_base64);
        console.log(`图像数据长度: ${imageData.length} 字符`);
        
        // 构建请求体（严格按照文档格式）
        const requestBody = {
            model: styleConfig.model,
            input: {
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                image: imageData  // 使用完整的data URL格式
                            },
                            {
                                text: styleConfig.positive_prompt
                            }
                        ]
                    }
                ]
            },
            parameters: {
                n: 1,  // 输出1张图像
                negative_prompt: styleConfig.negative_prompt,
                size: "1024*1024",  // 输出分辨率
                prompt_extend: true,  // 开启提示词优化
                watermark: true  // 添加水印
            }
        };
        
        console.log("调用qwen-image-edit模型...");
        console.log("提示词长度:", styleConfig.positive_prompt.length);
        console.log("反向提示词长度:", styleConfig.negative_prompt.length);
        
        try {
            // 调用图像编辑API（同步调用，因为文档未提到异步）
            const response = await axios.post(
                `${BASE_URL}/services/aigc/multimodal-generation/generation`,
                requestBody,
                {
                    headers: {
                        "Authorization": `Bearer ${API_KEY}`,
                        "Content-Type": "application/json"
                    },
                    timeout: 60000  // 60秒超时，因为图像生成可能较慢
                }
            );
            
            console.log("API响应状态:", response.status);
            console.log("响应数据:", JSON.stringify(response.data, null, 2));
            
            // 检查响应格式
            if (response.data.code) {
                // 有错误码表示失败
                throw new Error(`${response.data.code}: ${response.data.message}`);
            }
            
            if (!response.data.output || !response.data.output.choices || 
                !response.data.output.choices[0] || 
                !response.data.output.choices[0].message || 
                !response.data.output.choices[0].message.content) {
                console.error("API响应格式不正确:", response.data);
                throw new Error("API响应格式不正确");
            }
            
            // 提取生成的图片URL - 修正解析逻辑
            const content = response.data.output.choices[0].message.content;
            console.log("content结构:", JSON.stringify(content, null, 2));
            
            let imageUrl = null;
            
            // 修正解析逻辑：根据实际的返回结构
            if (Array.isArray(content) && content.length > 0) {
                // 遍历content数组查找image字段
                for (const item of content) {
                    if (typeof item === 'object' && item.image) {
                        // image字段可能是字符串（URL）也可能是对象
                        if (typeof item.image === 'string') {
                            imageUrl = item.image;
                            break;
                        } else if (typeof item.image === 'object' && item.image.url) {
                            imageUrl = item.image.url;
                            break;
                        }
                    }
                }
            }
            
            if (!imageUrl) {
                // 尝试其他可能的格式
                console.log("尝试其他解析方式...");
                
                // 如果content不是数组，可能是对象
                if (content && content.image && typeof content.image === 'string') {
                    imageUrl = content.image;
                }
                
                // 如果还没有找到，尝试直接查找
                if (!imageUrl) {
                    // 深度搜索整个响应中的URL
                    const searchForUrl = (obj) => {
                        if (!obj || typeof obj !== 'object') return null;
                        
                        // 检查当前对象是否有类似URL的字段
                        if (typeof obj === 'string' && obj.includes('http') && obj.includes('.png')) {
                            return obj;
                        }
                        
                        for (const key in obj) {
                            if (typeof obj[key] === 'string' && 
                                obj[key].includes('http') && 
                                obj[key].includes('.png')) {
                                return obj[key];
                            }
                            if (typeof obj[key] === 'object') {
                                const found = searchForUrl(obj[key]);
                                if (found) return found;
                            }
                        }
                        return null;
                    };
                    
                    imageUrl = searchForUrl(response.data);
                }
            }
            
            if (!imageUrl) {
                console.error("未找到生成的图片URL，完整响应:", response.data);
                throw new Error("生成的图片URL不存在");
            }
            
            console.log("✅ 图像编辑成功！");
            console.log("生成图片URL:", imageUrl);
            
            // 返回结果给前端
            res.json({
                success: true,
                imageUrl: imageUrl,
                model: styleConfig.model,
                request_id: response.data.request_id || "未获取到request_id",
                usage: response.data.output?.usage || {},
                content_structure: content // 用于调试，了解实际返回结构
            });
            
        } catch (apiError) {
            console.error("API调用错误:", apiError.response?.data || apiError.message);
            
            // 提供详细的错误信息
            let errorMsg = "图像编辑失败";
            let requestId = null;
            
            if (apiError.response?.data) {
                console.error("错误响应数据:", apiError.response.data);
                errorMsg = apiError.response.data.message || errorMsg;
                requestId = apiError.response.data.request_id;
                
                if (apiError.response.data.code === 'InvalidApiKey') {
                    errorMsg = "API Key无效";
                } else if (apiError.response.data.code === 'ModelNotAvailable') {
                    errorMsg = "模型不可用，请检查模型名称";
                }
            }
            
            throw new Error(`${errorMsg} (Request ID: ${requestId || '无'})`);
        }
        
    } catch (error) {
        console.error("❌ 处理失败:", error.message);
        
        // 返回错误信息
        res.status(500).json({
            success: false,
            error: error.message,
            suggestion: "请检查API Key和模型配置，或联系技术支持"
        });
    }
});

// 调试接口 - 查看API返回的实际结构
app.post("/api/debug-response", async (req, res) => {
    try {
        const { style_name, image_base64 } = req.body;
        
        if (!image_base64) {
            return res.status(400).json({ error: "请提供图片" });
        }
        
        const styleConfig = STYLE_CONFIGS[style_name] || STYLE_CONFIGS["徽州生宣"];
        const imageData = extractBase64(image_base64);
        
        // 简化的请求，只用于调试
        const requestBody = {
            model: styleConfig.model,
            input: {
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                image: imageData
                            },
                            {
                                text: "简单描述这张图片"
                            }
                        ]
                    }
                ]
            },
            parameters: {
                n: 1
            }
        };
        
        const response = await axios.post(
            `${BASE_URL}/services/aigc/multimodal-generation/generation`,
            requestBody,
            {
                headers: {
                    "Authorization": `Bearer ${API_KEY}`,
                    "Content-Type": "application/json"
                },
                timeout: 30000
            }
        );
        
        res.json({
            success: true,
            full_response: response.data,
            content_structure: response.data.output?.choices?.[0]?.message?.content,
            request_id: response.data.request_id
        });
        
    } catch (error) {
        console.error("调试接口错误:", error.response?.data || error.message);
        
        res.status(500).json({
            success: false,
            error: error.message,
            response_data: error.response?.data
        });
    }
});

// 主页
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// 启动服务器
const PORT = 3000;
app.listen(PORT, () => {
    console.log("=".repeat(60));
    console.log("🎨 阿里云图像编辑服务（修复版）");
    console.log("=".repeat(60));
    console.log(`✅ 服务已启动: http://localhost:${PORT}`);
    console.log(`🤖 使用模型: qwen-image-edit-max`);
    console.log("");
    console.log("📋 接口:");
    console.log(`  GET  /api/health         - 健康检查`);
    console.log(`  POST /api/image-edit     - 图像编辑（主接口）`);
    console.log(`  POST /api/debug-response - 调试接口（查看返回结构）`);
    console.log("");
    console.log("🎯 已修复:");
    console.log("  • 图片URL解析逻辑");
    console.log("  • 添加了多种解析方式");
    console.log("  • 增加了调试接口");
    console.log("=".repeat(60));
});