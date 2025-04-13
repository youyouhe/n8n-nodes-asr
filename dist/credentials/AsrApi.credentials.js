"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AsrApi = void 0;
class AsrApi {
    constructor() {
        this.name = 'asrApi';
        this.displayName = 'ASR API Credentials';
        this.documentationUrl = 'https://docs.example.com/asr-api'; // Replace with actual documentation URL if available
        this.properties = [
            {
                displayName: 'ASR Service URL',
                name: 'asrUrl',
                type: 'string',
                default: 'http://192.168.8.107:50000/api/v1/asr',
                placeholder: 'http://your-asr-service/api/v1/asr',
                description: 'The URL of your ASR service endpoint',
                required: true,
            },
            {
                displayName: 'API Key',
                name: 'apiKey',
                type: 'string',
                typeOptions: {
                    password: true,
                },
                default: '',
                placeholder: 'Enter your API Key',
                description: 'The API key for accessing the ASR service',
                required: true,
            },
        ];
    }
}
exports.AsrApi = AsrApi;
//# sourceMappingURL=AsrApi.credentials.js.map