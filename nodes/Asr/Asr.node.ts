import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
	NodeConnectionType, // Import NodeConnectionType
	IRequestOptions, // Import IRequestOptions explicitly
} from 'n8n-workflow';
// Remove unused import: import { OptionsWithUri } from 'request-promise-native';
import FormData from 'form-data'; // Use default import
import { Readable } from 'stream';
import { spawn } from 'child_process';
const rp = require('request-promise-native');

// Helper function moved outside the class
/**
 * Converts an audio buffer to WAV format using ffmpeg.
 * Requires ffmpeg to be installed on the system.
 * @param executionContext The execution context (`this` from `execute`) providing access to logger, getNode, etc.
 * @param inputBuffer The audio buffer to convert.
 */
async function convertToWav(executionContext: IExecuteFunctions, inputBuffer: Buffer): Promise<Buffer> {
	const node = executionContext.getNode(); // Get node reference
	const logger = executionContext.logger; // Get logger reference

	return new Promise((resolve, reject) => {
		const ffmpegProcess = spawn('ffmpeg', [
			'-i', 'pipe:0', // Input from stdin
			'-f', 'wav',    // Output format WAV
			'-acodec', 'pcm_s16le', // Standard WAV codec
			'-ar', '44100', // 采样率 44100Hz
			'-ac', '2',     // 双声道
			'pipe:1',       // Output to stdout
		]);

		const outputChunks: Buffer[] = [];
		let errorOutput = '';

		// Handle stdout
		ffmpegProcess.stdout.on('data', (chunk) => {
			outputChunks.push(chunk);
		});

		// Handle stderr
		ffmpegProcess.stderr.on('data', (chunk) => {
			errorOutput += chunk.toString();
		});

		// Handle errors
		ffmpegProcess.on('error', (err) => {
			reject(new NodeOperationError(node, `Failed to spawn ffmpeg: ${err.message}. Is ffmpeg installed and in PATH?`));
		});

		// Handle process exit
		ffmpegProcess.on('close', (code) => {
			if (code === 0) {
				resolve(Buffer.concat(outputChunks));
			} else {
				logger.error(`ffmpeg exited with code ${code}: ${errorOutput}`);
				reject(new NodeOperationError(node, `ffmpeg conversion failed (code ${code}): ${errorOutput}`));
			}
		});

		// Write input buffer to ffmpeg's stdin
		const inputStream = new Readable();
		inputStream.push(inputBuffer);
		inputStream.push(null); // Signal end of stream
		inputStream.pipe(ffmpegProcess.stdin);
	});
}

export class Asr implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ASR Processor',
		name: 'asr',
		icon: 'file:icons/asr.png', // Reference the icon file (use .svg if you have an SVG)
		group: ['transform'],
		version: 1,
		description: 'Processes an audio file URL using a remote ASR service.',
		defaults: {
			name: 'ASR',
		},
		inputs: ['main'] as NodeConnectionType[], // Cast to satisfy type checker
		outputs: ['main'] as NodeConnectionType[], // Cast to satisfy type checker
		credentials: [
			{
				name: 'asrApi',
				required: true,
			},
		],
		properties: [
			// Input Property: Audio File URL
			{
				displayName: 'Audio File URL',
				name: 'audioUrl',
				type: 'string',
				default: '',
				placeholder: 'https://example.com/audio.mp3',
				description: 'The URL of the audio file to process',
				required: true,
			},
			// Input Property: Language (Optional)
			{
				displayName: 'Language',
				name: 'language',
				type: 'string',
				default: 'auto',
				description: 'Language code for ASR (e.g., "en", "zh"). "auto" for automatic detection.',
			},
			// Input Property: Mode (Optional - Future Use)
			// {
			// 	displayName: 'Mode',
			// 	name: 'mode',
			// 	type: 'options',
			// 	options: [
			// 		{ name: 'Transcription', value: 'transcriptions' },
			// 		{ name: 'Translation', value: 'translations' }, // Requires separate translation logic
			// 	],
			// 	default: 'transcriptions',
			// 	description: 'Whether to transcribe or translate the audio',
			// },
			// Input Property: Output Field Name
			{
				displayName: 'Output Field Name',
				name: 'outputFieldName',
				type: 'string',
				default: 'transcription',
				description: 'The name of the field to store the transcription result in the output JSON.',
			},
		],
	};

	// Removed convertToWav method from here

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const credentials = await this.getCredentials('asrApi');

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const audioUrl = this.getNodeParameter('audioUrl', itemIndex, '') as string;
				const language = this.getNodeParameter('language', itemIndex, 'auto') as string;
				// const mode = this.getNodeParameter('mode', itemIndex, 'transcriptions') as string; // Future use
				const outputFieldName = this.getNodeParameter('outputFieldName', itemIndex, 'transcription') as string;

				if (!audioUrl) {
					throw new NodeOperationError(this.getNode(), 'Audio File URL is required.', { itemIndex });
				}

				const asrUrl = credentials.asrUrl as string;
				const apiKey = credentials.apiKey as string;

				if (!asrUrl || !apiKey) {
					throw new NodeOperationError(this.getNode(), 'ASR Service URL and API Key must be configured in credentials.', { itemIndex });
				}

				// 1. Download the audio file
				this.logger.info(`Attempting to download audio from: ${audioUrl}`);
				const audioBuffer = await rp({
					url: audioUrl,
					method: 'GET',
					headers: { 'User-Agent': 'n8n-asr-node/1.0 (https://n8n.io)' },
					encoding: null, // 关键：强制返回 Buffer
					resolveWithFullResponse: false,
					timeout: 30000,
				});
				this.logger.info(`Downloaded audio data type: ${typeof audioBuffer}, isBuffer: ${Buffer.isBuffer(audioBuffer)}, length: ${Buffer.isBuffer(audioBuffer) ? audioBuffer.length : (audioBuffer as any)?.length ?? 'N/A'}`);
				if (Buffer.isBuffer(audioBuffer) && audioBuffer.length < 200) { // Log first few bytes if it's a small buffer
					this.logger.info(`Downloaded audio (first ${audioBuffer.length} bytes hex): ${audioBuffer.toString('hex')}`);
				} else if (typeof audioBuffer === 'string') {
					this.logger.info(`Downloaded audio (first 200 chars): ${audioBuffer.slice(0, 200)}`);
				}

				// 2. Convert audio to WAV format
				this.logger.info('Converting downloaded audio to WAV format...');
				let wavBuffer: Buffer;
				const fs = require('fs');
				try {
					// Ensure audioBuffer is treated as Buffer
					const inputBuffer = Buffer.isBuffer(audioBuffer)
						? audioBuffer
						: typeof audioBuffer === 'string'
							? Buffer.from(audioBuffer, 'latin1') // Convert string back using latin1
							: Buffer.from(audioBuffer as ArrayBuffer); // Fallback for ArrayBuffer
					fs.writeFileSync('/tmp/n8n_asr_input.wav', inputBuffer);
					this.logger.info('Saved inputBuffer to /tmp/n8n_asr_input.wav for manual inspection.');

					// 检查是否为标准 wav（pcm_s16le, 16kHz, mono）
					let isStandardWav = false;
					try {
						if (inputBuffer.slice(0, 4).toString() === 'RIFF' && inputBuffer.slice(8, 12).toString() === 'WAVE') {
							// 检查采样率、声道、编码
							const fmtChunkOffset = inputBuffer.indexOf(Buffer.from('fmt '));
							if (fmtChunkOffset > 0) {
								const audioFormat = inputBuffer.readUInt16LE(fmtChunkOffset + 8);
								const numChannels = inputBuffer.readUInt16LE(fmtChunkOffset + 10);
								const sampleRate = inputBuffer.readUInt32LE(fmtChunkOffset + 12);
								const bitsPerSample = inputBuffer.readUInt16LE(fmtChunkOffset + 22);
								if (audioFormat === 1 && numChannels === 1 && sampleRate === 16000 && bitsPerSample === 16) {
									isStandardWav = true;
								}
								this.logger.info(`WAV header: format=${audioFormat}, channels=${numChannels}, rate=${sampleRate}, bits=${bitsPerSample}, isStandardWav=${isStandardWav}`);
							}
						}
					} catch (e) {
						this.logger.warn('Failed to parse WAV header for inputBuffer');
					}

					if (isStandardWav) {
						wavBuffer = inputBuffer;
						this.logger.info('Input is already standard wav, skip ffmpeg conversion.');
					} else {
						wavBuffer = await convertToWav(this, inputBuffer);
						this.logger.info(`Conversion successful. WAV size: ${wavBuffer.length} bytes.`);
						fs.writeFileSync('/tmp/n8n_asr_debug.wav', wavBuffer);
						this.logger.info('Saved wavBuffer to /tmp/n8n_asr_debug.wav for manual inspection.');
					}
				} catch (conversionError) {
					// If conversion fails, re-throw the specific NodeOperationError
					throw conversionError;
				}


				// 3. Prepare form data for API request
				const wavFilename = 'input.wav'; // Use a fixed WAV filename

				// 4. Call the ASR API using manual form-data + request-promise-native
				const FormData = require('form-data');
				const form = new FormData();
				form.append('files', wavBuffer, { filename: wavFilename, contentType: 'audio/wav' });
				form.append('keys', apiKey);
				form.append('lang', language);

				const response = await rp({
					method: 'POST',
					url: asrUrl,
					headers: form.getHeaders(),
					body: form,
					resolveWithFullResponse: false,
					encoding: null, // Get Buffer if needed
					timeout: 20000,
				});

				// 5. Process the response
				let responseBody = response;
				if (Buffer.isBuffer(responseBody)) {
					responseBody = responseBody.toString('utf-8');
				}
				if (typeof responseBody === 'string') {
					try {
						responseBody = JSON.parse(responseBody);
					} catch (e) {
						this.logger.warn(`ASR API response is not valid JSON: ${responseBody}`, { itemIndex });
					}
				}
				let transcription = '获取失败'; // Default value if extraction fails
				if (responseBody && responseBody.result && Array.isArray(responseBody.result) && responseBody.result.length > 0) {
					transcription = responseBody.result[0]?.text ?? transcription;
				} else {
					this.logger.warn(`Unexpected ASR API response structure: ${JSON.stringify(responseBody)}`, { itemIndex });
					this.logger.info(`Full ASR API response: ${JSON.stringify(responseBody)}`);
				}

				// 6. Prepare output data
				const newItem: INodeExecutionData = {
					json: { ...items[itemIndex].json, [outputFieldName]: transcription },
					pairedItem: { item: itemIndex },
				};
				returnData.push(newItem);

			} catch (error) {
				if (this.continueOnFail()) {
					// Wrap the caught error in NodeOperationError
					const nodeError = new NodeOperationError(this.getNode(), error instanceof Error ? error.message : String(error), { itemIndex });
					returnData.push({ json: this.getInputData(itemIndex)[0].json, error: nodeError });
					continue;
				}
				throw error;
			}
		}

		return this.prepareOutputData(returnData);
	}
}