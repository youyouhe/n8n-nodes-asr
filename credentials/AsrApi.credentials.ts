import { ICredentialType, INodeProperties } from 'n8n-workflow';

export class AsrApi implements ICredentialType {
	name = 'asrApi';
	displayName = 'ASR API Credentials';
	documentationUrl = 'https://docs.example.com/asr-api'; // Replace with actual documentation URL if available
	properties: INodeProperties[] = [
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