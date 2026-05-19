'use strict';

const Q = require('q');

const S3 = require('sociolla-core/lib/aws/s3');
const fs = require('fs');
const writeXlsxFile = require('write-excel-file/node');
const SES = require('sociolla-core/lib/aws/ses');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-monthly-business-review' });
const workerHelpers = require('../../helpers/workerHelper');

module.exports = (message) => {
	const criteria = message.data.criteria;
	const context = message.data.context;
	const isValidEmail = workerHelpers.checkValidEmail(criteria.send_to_email);
	if (!isValidEmail) {
		logger.error(
			`[${context?.user?.name} - ${context?.user?.email}] Email to '${criteria.send_to_email}' is not valid!`,
		);
		return;
	}
	const clientMongoDB = message.clientMongoDB;
	const clientJarvis = message.clientJarvis;
	const file_name = message.data.file_name || null;
	const connEmailLogs = clientMongoDB.db(process.env.MS_SOCIOLLA_MONGODB).collection('email_logs');
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis monthly-business-review`);

	const generateEmptyObj = (len = 1, obj = {}) => {
		const data = [];
		for (let i = 0; i < len; i++) {
			data.push(obj);
		}
		return data;
	};

	return Q.try(() => {
		const outputFile = file_name;
		const objects = criteria.queryRow;
		objects.splice(12, 0, { val: 'gray' });

		const HEADER_ROW = [
			{
				value: 'Platform',
				fontWeight: 'bold',
				topBorderColor: '#000000',
				rightBorderColor: '#000000',
				backgroundColor: '#a64d79',
				color: '#fffff',
				align: 'center',
			},
			{
				value: 'P1M',
				fontWeight: 'bold',
				topBorderColor: '#000000',
				rightBorderColor: '#000000',
				backgroundColor: '#a64d79',
				color: '#fffff',
				align: 'center',
			},
			{
				value: 'EVO',
				fontWeight: 'bold',
				topBorderColor: '#000000',
				rightBorderColor: '#000000',
				backgroundColor: '#a64d79',
				color: '#fffff',
				align: 'center',
			},
			{
				value: 'Target',
				fontWeight: 'bold',
				topBorderColor: '#000000',
				rightBorderColor: '#000000',
				backgroundColor: '#a64d79',
				color: '#fffff',
				align: 'center',
			},
			{
				value: 'YTD',
				fontWeight: 'bold',
				topBorderColor: '#000000',
				rightBorderColor: '#000000',
				backgroundColor: '#a64d79',
				color: '#fffff',
				align: 'center',
			},
			{
				value: 'EVO',
				fontWeight: 'bold',
				topBorderColor: '#000000',
				rightBorderColor: '#000000',
				backgroundColor: '#a64d79',
				color: '#fffff',
				align: 'center',
			},
			{
				value: 'Target (YTD)',
				fontWeight: 'bold',
				topBorderColor: '#000000',
				rightBorderColor: '#000000',
				backgroundColor: '#a64d79',
				color: '#fffff',
				align: 'center',
			},
			{
				value: 'P3M',
				fontWeight: 'bold',
				topBorderColor: '#000000',
				rightBorderColor: '#000000',
				backgroundColor: '#a64d79',
				color: '#fffff',
				align: 'center',
			},
			{
				value: 'P6M',
				fontWeight: 'bold',
				topBorderColor: '#000000',
				rightBorderColor: '#000000',
				backgroundColor: '#a64d79',
				color: '#fffff',
				align: 'center',
			},
			{
				value: 'P12M',
				fontWeight: 'bold',
				topBorderColor: '#000000',
				rightBorderColor: '#000000',
				backgroundColor: '#a64d79',
				color: '#fffff',
				align: 'center',
			},
			{
				value: 'Monthly Business Review OCT 2022 - B2C - Net Revenue',
				fontWeight: 'bold',
				topBorderColor: '#000000',
				rightBorderColor: '#000000',
				backgroundColor: '#ffff00',
			},
		];

		const data = [[], HEADER_ROW, [], HEADER_ROW, [], HEADER_ROW, [], HEADER_ROW, [], HEADER_ROW];

		const columns = [{ width: 20 }, ...generateEmptyObj(9, { width: 15 }), { width: 50 }];

		return writeXlsxFile(data, {
			columns,
			filePath: outputFile,
			orientation: 'landscape',
		})
			.then(() => {
				logger.info(`[${context?.user?.name} - ${context?.user?.email}] Finish insert to CSV`);
				return S3.upload({
					path: process.env.JARVIS_S3_PATH,
					fileName: outputFile,
					fileData: fs.createReadStream(outputFile),
					contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
					isReplaceFile: true,
				});
			})
			.then((result) => {
				const cdnUrl = result.cdn_url ? result.cdn_url : result.url;
				const subjectEmail = 'Jarvis : Export Monthly Business Review Report';
				const emailTo = criteria.send_to_email;

				return SES.sendEmail(
					{
						to: emailTo,
						from: process.env.SES_GMAIL_MAIL_JARVIS,
						sparkPostOption: { options: { click_tracking: false } },
						subject: subjectEmail,
						html: `<a href="${cdnUrl}" rel="notrack">Download Here</a>`,
					},
					'mail_jet',
					true,
				)
					.then(() => {
						return connEmailLogs.insertOne({
							subject: subjectEmail,
							recipient_email: [emailTo],
							status: 'success',
							reason: 'Url :' + cdnUrl,
							created_at: new Date(),
						});
					})
					.catch((err) => {
						return connEmailLogs
							.insertOne({
								subject: subjectEmail,
								recipient_email: [emailTo],
								status: 'failure',
								reason: 'Error :' + err,
								created_at: new Date(),
							})
							.then(() => {
								throw err;
							});
					});
			})
			.then(() => {
				const file_stats = fs.statSync(outputFile);
				const log_params = {
					...context.log_params,
					filesize: file_stats?.size || 0,
					created_at: new Date(),
					updated_at: new Date(),
				};

				return clientJarvis.db(process.env.JARVIS_MONGODB).collection('user_logs').insertOne(log_params);
			})
			.catch((err) => {
				throw err;
			})
			.finally(() => {
				fs.rmSync(outputFile, { force: true });
			});
	});
};
