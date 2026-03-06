const { Buffer } = require('node:buffer');
/**
 * QR Code Login Module (Updated with Aineishe Third-Party integration)
 */
const axios = require('axios');
const store = require('../models/store');

const ChromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

class QRLoginSession {
    static async requestQRCode() {
        return MiniProgramLoginSession.requestLoginCode();
    }

    static async checkStatus(qrsig) {
        return MiniProgramLoginSession.queryStatus(qrsig);
    }
}

class MiniProgramLoginSession {
    static async requestLoginCode(uin = '') {
        try {
            const apiConfig = store.getThirdPartyApiConfig ? store.getThirdPartyApiConfig() : {};
            const apiKey = apiConfig.aineisheKey || '0KOp6C8f1QtUDS0P75D5KEKb'; // 默认 fallback

            if (!uin) {
                // 根据要求，这里需要UIN。前端未传时给临时报错，或者兼容其他模式。
                // 若未传UIN我们暂时当作未提供。如果在后续测试中必须要UIN，前端会控制。
                console.warn('[QRLogin] Aineishe API requires UIN. Provided: empty');
            }

            // Aineishe API (正确路径需带 /api 且要求以 Query 参数传递，并提升超时预防上游卡死)
            const response = await axios.get('https://api.aineishe.com/api/qqnc/login', {
                params: {
                    api_key: apiKey,
                    ...(uin ? { uin } : {})
                },
                headers: {
                    'User-Agent': ChromeUA,
                },
                timeout: 40000 // 增加 40 秒超时，该服务上游可能响应极慢
            });

            const data = response.data;
            if (data.code !== 200 && data.code !== 0 && !data.data) {
                throw new Error(data.msg || data.message || '获取二维码失败');
            }

            // 假设返回的数据结构有二维码 base64/url 和轮询依据的 token
            const qrData = data.data || data;

            return {
                code: qrData.qrsig || qrData.token || Date.now().toString(), // 暂用时间戳作为回落状态码（防御性设计）
                url: qrData.qrcode_url || qrData.url || '',
                image: qrData.qrcode_base64 || qrData.image || qrData.qrcode || '',
            };
        } catch (error) {
            console.error('MP Request Login Code Error:', error.message);
            throw error;
        }
    }

    static async queryStatus(code, uin = '') {
        try {
            const apiConfig = store.getThirdPartyApiConfig ? store.getThirdPartyApiConfig() : {};
            const apiKey = apiConfig.aineisheKey || '0KOp6C8f1QtUDS0P75D5KEKb';

            // 状态查询也采用同样的传参约定
            const response = await axios.get('https://api.aineishe.com/api/qqnc/login', {
                params: {
                    api_key: apiKey,
                    ...(uin ? { uin } : {}),
                    ...(code ? { qrsig: code } : {})
                },
                headers: {
                    'User-Agent': ChromeUA,
                },
                timeout: 40000
            });

            if (response.status !== 200) return { status: 'Error' };
            const data = response.data;

            // 根据通用经验判断第三方网关的状态码设计
            if (data.code === 200 || data.code === 0) {
                return {
                    status: 'OK',
                    ticket: typeof data.data === 'string' ? data.data : (data.data && data.data.token ? data.data.token : 'TICKET'),
                    uin: (data.data && data.data.uin) || uin || '',
                    nickname: (data.data && data.data.nickname) || ''
                };
            } else if (data.code === 10001 || data.msg?.includes('等待验证') || data.msg?.includes('请扫描')) {
                return { status: 'Wait' };
            } else if (data.code === 10002 || data.msg?.includes('过期') || data.msg?.includes('失效')) {
                return { status: 'Used' };
            } else {
                return { status: 'Wait' }; // Defaulting to Wait for resilience on unknown status.
            }
        } catch (error) {
            console.error('MP Query Status Error:', error.message);
            throw error;
        }
    }

    static async getAuthCode(ticket, appid = '1112386029') {
        // 第三方接口直接返回最终的 code，无需用 ticket 进行兑换转换，只需透传返回
        return ticket || '';
    }
}

module.exports = { QRLoginSession, MiniProgramLoginSession };
