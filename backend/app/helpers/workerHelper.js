/**
 * @author Nur Sancoyo K
 */
'use strict';

const S3 = require('sociolla-core/lib/aws/s3');
const fs = require('fs');
const SES = require('sociolla-core/lib/aws/ses');
const { ObjectId } = require('mongodb');

module.exports = class workerHelper {
	/**
	 * Send an email with the given options.
	 *
	 * @param {object} options - The options for sending the email.
	 * @param {Array} options.input - The input data to be processed.
	 * @param {Writable} options.output - The output stream to write the processed data to.
	 * @param {string} options.outputFile - The path to the output file.
	 * @param {object} options.criteria - The criteria for sending the email.
	 * @param {string} options.subject - The subject of the email.
	 * @param {object} options.logger - The logger object for logging messages.
	 * @param {object} options.context - The context object containing user information.
	 * @param {object} options.clientJarvis - The client object to interact with the Jarvis service.
	 */
	static async sendmail(options) {
		const { input, output, outputFile, criteria, subject, logger, context, clientJarvis, is_export_excel } =
			options;
		const { name, email } = context?.user || {};

		try {
			if (!is_export_excel) {
				input.push(null);
				await new Promise((resolve, reject) => {
					output.on('finish', resolve);
					output.on('error', reject);
				});
			}
			const contentType = is_export_excel
				? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
				: 'text/csv';
			logger.info(`[${name} - ${email}] Finish insert to CSV`);

			const fileStats = fs.statSync(outputFile);

			let result;
			const maxRetries = 3;
			for (let attempt = 1; attempt <= maxRetries; attempt++) {
				try {
					result = await S3.upload({
						path: process.env.JARVIS_S3_PATH,
						fileName: outputFile,
						fileData: fs.createReadStream(outputFile),
						contentType,
						isReplaceFile: true,
					});
					break;
				} catch (uploadErr) {
					const isRetryable = uploadErr.name === 'InternalError' || uploadErr.code === 'InternalError';
					if (isRetryable && attempt < maxRetries) {
						logger.warn(
							`[${name} - ${email}] S3 upload attempt ${attempt} failed with InternalError, retrying...`,
						);
						await new Promise((r) => setTimeout(r, attempt * 1000));
					} else {
						throw uploadErr;
					}
				}
			}

			fs.rmSync(outputFile, { force: true });

			const cdnUrl = result.cdn_url ?? result.url;
			logger.info(`[${name} - ${email}] cdnUrl: ${cdnUrl}`);

			await SES.sendEmail({
				to: criteria.send_to_email,
				from: process.env.SES_GMAIL_MAIL_JARVIS,
				sparkPostOption: { options: { click_tracking: false } },
				subject: subject,
				html: '<a href="' + cdnUrl + '" rel="notrack">Download Here</a>',
			});

			logger.info(`[${name} - ${email}] Email sent successfully!`);

			const memoryUsage = process.memoryUsage();
			const toMB = (bytes) => (bytes / 1024 / 1024).toFixed(2);

			logger.info('Total Memory Usage:');
			logger.info(`- Heap Total: ${toMB(memoryUsage.heapTotal)} MB`);
			logger.info(`- Heap Used: ${toMB(memoryUsage.heapUsed)} MB`);

			if (context.log_params?.data?.filter) {
				context.log_params.data.filter = JSON.stringify(context.log_params.data.filter);
			}

			await clientJarvis
				.db(process.env.JARVIS_MONGODB)
				.collection('user_logs')
				.updateOne(
					{ _id: new ObjectId(context.log_id) },
					{
						$set: {
							...context.log_params,
							filesize: fileStats?.size || 0,
							fileurl: cdnUrl,
							updated_at: new Date(),
						},
					},
				);
		} catch (error) {
			logger.error(error);
			throw error;
		}
	}

	static checkValidEmail(email) {
		const regexEmail =
			/^(([^<>()[\].,;:\s@"]+(\.[^<>()[\].,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/u;
		const isNotValid =
			!email ||
			(Array.isArray(email) && !email.length) ||
			(typeof email === 'string' && !regexEmail.test(email)) ||
			(Array.isArray(email) && email.some((to) => !regexEmail.test(to)));
		return !isNotValid;
	}
};
