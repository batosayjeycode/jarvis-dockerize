'use strict';

const Q = require('q');

const S3 = require('sociolla-core/lib/aws/s3');
const fs = require('fs');
const writeXlsxFile = require('write-excel-file/node');
const SES = require('sociolla-core/lib/aws/ses');
const Logger = require('sociolla-core/lib/logger');
const logger = Logger.getInstance({ worker: 'export-inventory-management-inventory-value' });
const workerHelpers = require('../../helpers/workerHelper');

module.exports = async (message) => {
	logger.info('Start jarvis inventory-management-inventory-value');
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
	return Q.try(() => {
		const outputFile = file_name;
		const objects = criteria.queryRow;
		const data = [
			[],
			[
				{
					value: 'Inventory Type',
					topBorderColor: '#000000',
					leftBorderColor: '#000000',
					rightBorderColor: '#000000',
					fontWeight: 'bold',
					align: 'center',
				},
				{
					value: 'ALL',
					topBorderColor: '#000000',
					fontWeight: 'bold',
					align: 'right',
				},
				{
					topBorderColor: '#000000',
					rightBorderColor: '#000000',
				},
				{
					value: 'Damage',
					topBorderColor: '#000000',
					fontWeight: 'bold',
					align: 'right',
				},
				{
					topBorderColor: '#000000',
					rightBorderColor: '#000000',
				},
				{
					value: 'Expired',
					topBorderColor: '#000000',
					fontWeight: 'bold',
					align: 'right',
				},
				{
					topBorderColor: '#000000',
					rightBorderColor: '#000000',
				},
				{
					value: 'Expiring <= 1 Month',
					topBorderColor: '#000000',
					fontWeight: 'bold',
					align: 'right',
				},
				{
					topBorderColor: '#000000',
					rightBorderColor: '#000000',
				},
				{
					value: 'Expiring 1-3 Months',
					topBorderColor: '#000000',
					fontWeight: 'bold',
					align: 'right',
				},
				{
					topBorderColor: '#000000',
					rightBorderColor: '#000000',
				},
				{
					value: 'Expiring 3-6 Months',
					topBorderColor: '#000000',
					fontWeight: 'bold',
					align: 'right',
				},
				{
					topBorderColor: '#000000',
					rightBorderColor: '#000000',
				},
				{
					value: 'Expiring 6-9 Months',
					topBorderColor: '#000000',
					fontWeight: 'bold',
					align: 'right',
				},
				{
					topBorderColor: '#000000',
					rightBorderColor: '#000000',
				},
				{
					value: 'Expiring 9-12 Months',
					topBorderColor: '#000000',
					fontWeight: 'bold',
					align: 'right',
				},
				{
					topBorderColor: '#000000',
					rightBorderColor: '#000000',
				},
				{
					value: 'Expiring > 12 Months',
					topBorderColor: '#000000',
					fontWeight: 'bold',
					align: 'right',
				},
				{
					topBorderColor: '#000000',
					rightBorderColor: '#000000',
				},
			],
			[
				{
					leftBorderColor: '#000000',
					bottomBorderColor: '#000000',
					rightBorderColor: '#000000',
				},
				{
					value: 'Qty',
					borderColor: '#000000',
				},
				{
					value: 'Value',
					borderColor: '#000000',
				},
				{
					value: 'Qty',
					borderColor: '#000000',
				},
				{
					value: 'Value',
					borderColor: '#000000',
				},
				{
					value: 'Qty',
					borderColor: '#000000',
				},
				{
					value: 'Value',
					borderColor: '#000000',
				},
				{
					value: 'Qty',
					borderColor: '#000000',
				},
				{
					value: 'Value',
					borderColor: '#000000',
				},
				{
					value: 'Qty',
					borderColor: '#000000',
				},
				{
					value: 'Value',
					borderColor: '#000000',
				},
				{
					value: 'Qty',
					borderColor: '#000000',
				},
				{
					value: 'Value',
					borderColor: '#000000',
				},
				{
					value: 'Qty',
					borderColor: '#000000',
				},
				{
					value: 'Value',
					borderColor: '#000000',
				},
				{
					value: 'Qty',
					borderColor: '#000000',
				},
				{
					value: 'Value',
					borderColor: '#000000',
				},
				{
					value: 'Qty',
					borderColor: '#000000',
				},
				{
					value: 'Value',
					borderColor: '#000000',
				},
			],
			[
				{
					value: 'Direct',
					fontWeight: 'bold',
					borderColor: '#000000',
				},
				{
					borderColor: '#000000',
				},
				{
					borderColor: '#000000',
				},
				{
					borderColor: '#000000',
				},
				{
					borderColor: '#000000',
				},
				{
					borderColor: '#000000',
				},
				{
					borderColor: '#000000',
				},
				{
					borderColor: '#000000',
				},
				{
					borderColor: '#000000',
				},
				{
					borderColor: '#000000',
				},
				{
					borderColor: '#000000',
				},
				{
					borderColor: '#000000',
				},
				{
					borderColor: '#000000',
				},
				{
					borderColor: '#000000',
				},
				{
					borderColor: '#000000',
				},
				{
					borderColor: '#000000',
				},
				{
					borderColor: '#000000',
				},
				{
					borderColor: '#000000',
				},
				{
					borderColor: '#000000',
				},
			],
		];

		const title = {
			direct_internal: '--Internal',
			direct_external: '--External',
			consignment: 'Consignment',
			total: 'Total',
			in_percent: 'in %',
		};
		objects.forEach((row) => {
			let ROWS = [];
			if (row.inventory_type != 'in_percent') {
				ROWS = [
					{
						value: title[row?.inventory_type],
						borderColor: '#000000',
						fontWeight: row.inventory_type === 'consignment' ? 'bold' : '',
					},
					{
						value: parseInt(row?.qty_all || 0),
						type: Number,
						align: 'right',
						borderColor: '#000000',
					},
					{
						value: Math.round(parseFloat(row?.value_all || 0)),
						type: Number,
						align: 'right',
						borderColor: '#000000',
					},
					{
						value: parseInt(row?.qty_damage || 0),
						type: Number,
						align: 'right',
						borderColor: '#000000',
					},
					{
						value: Math.round(parseFloat(row?.value_damage || 0)),
						type: Number,
						align: 'right',
						borderColor: '#000000',
					},
					{
						value: parseInt(row?.qty_expired || 0),
						type: Number,
						align: 'right',
						borderColor: '#000000',
					},
					{
						value: Math.round(parseFloat(row?.value_expired || 0)),
						type: Number,
						align: 'right',
						borderColor: '#000000',
					},
					{
						value: parseInt(row?.qty_expired_less_1_month || 0),
						type: Number,
						align: 'right',
						borderColor: '#000000',
					},
					{
						value: Math.round(parseFloat(row?.value_expired_less_1_month || 0)),
						type: Number,
						align: 'right',
						borderColor: '#000000',
					},
					{
						value: parseInt(row?.qty_expired_1_3_month || 0),
						type: Number,
						align: 'right',
						borderColor: '#000000',
					},
					{
						value: Math.round(parseFloat(row?.value_expired_1_3_month || 0)),
						type: Number,
						align: 'right',
						borderColor: '#000000',
					},
					{
						value: parseInt(row?.qty_expired_3_6_month || 0),
						type: Number,
						align: 'right',
						borderColor: '#000000',
					},
					{
						value: Math.round(parseFloat(row?.value_expired_3_6_month || 0)),
						type: Number,
						align: 'right',
						borderColor: '#000000',
					},
					{
						value: parseInt(row?.qty_expired_6_9_month || 0),
						type: Number,
						align: 'right',
						borderColor: '#000000',
					},
					{
						value: Math.round(parseFloat(row?.value_expired_6_9_month || 0)),
						type: Number,
						align: 'right',
						borderColor: '#000000',
					},
					{
						value: parseInt(row?.qty_expired_9_12_month || 0),
						type: Number,
						align: 'right',
						borderColor: '#000000',
					},
					{
						value: Math.round(parseFloat(row?.value_expired_9_12_month || 0)),
						type: Number,
						align: 'right',
						borderColor: '#000000',
					},
					{
						value: parseInt(row?.qty_expired_more_12_month || 0),
						type: Number,
						align: 'right',
						borderColor: '#000000',
					},
					{
						value: Math.round(parseFloat(row?.value_expired_more_12_month || 0)),
						type: Number,
						align: 'right',
						borderColor: '#000000',
					},
				];
			} else {
				ROWS = [
					{
						value: title[row?.inventory_type],
						borderColor: '#000000',
					},
					{
						borderColor: '#000000',
					},
					{
						borderColor: '#000000',
					},
					{
						borderColor: '#000000',
					},
					{
						value: parseFloat(row?.percentage_value_damage).toFixed(2) + '%',
						align: 'right',
						borderColor: '#000000',
					},
					{
						borderColor: '#000000',
					},
					{
						value: parseFloat(row?.percentage_value_expired).toFixed(2) + '%',
						align: 'right',
						borderColor: '#000000',
					},
					{
						borderColor: '#000000',
					},
					{
						value: parseFloat(row?.percentage_value_expired_less_1_month).toFixed(2) + '%',
						align: 'right',
						borderColor: '#000000',
					},
					{
						borderColor: '#000000',
					},
					{
						value: parseFloat(row?.percentage_value_expired_1_3_month).toFixed(2) + '%',
						align: 'right',
						borderColor: '#000000',
					},
					{
						borderColor: '#000000',
					},
					{
						value: parseFloat(row?.percentage_value_expired_3_6_month).toFixed(2) + '%',
						align: 'right',
						borderColor: '#000000',
					},
					{
						borderColor: '#000000',
					},
					{
						value: parseFloat(row?.percentage_value_expired_6_9_month).toFixed(2) + '%',
						align: 'right',
						borderColor: '#000000',
					},
					{
						borderColor: '#000000',
					},
					{
						value: parseFloat(row?.percentage_value_expired_9_12_month).toFixed(2) + '%',
						align: 'right',
						borderColor: '#000000',
					},
					{
						borderColor: '#000000',
					},
					{
						value: parseFloat(row?.percentage_value_expired_more_12_month).toFixed(2) + '%',
						align: 'right',
						borderColor: '#000000',
					},
				];
			}
			data.push(ROWS);
		});
		const columns = [
			{ width: 30 },
			{ width: 20 },
			{ width: 20 },
			{ width: 20 },
			{ width: 20 },
			{ width: 20 },
			{ width: 20 },
			{ width: 20 },
			{ width: 20 },
			{ width: 20 },
			{ width: 20 },
			{ width: 20 },
			{ width: 20 },
			{ width: 20 },
			{ width: 20 },
			{ width: 20 },
			{ width: 20 },
			{ width: 20 },
			{ width: 20 },
		];

		return writeXlsxFile(data, {
			columns,
			filePath: outputFile,
			orientation: 'landscape',
		})
			.then(() => {
				logger.info('Finish insert to Excel');
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
				const subjectEmail = 'Jarvis - Inventory Value';
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
				logger.info(`[${context?.user?.name} - ${context?.user?.email}] Email sent successfully!`);
				const file_stats = fs.statSync(outputFile);
				const log_params = {
					...context.log_params,
					filesize: file_stats?.size || 0,
					created_at: new Date(),
					updated_at: new Date(),
				};

				return clientJarvis.db(process.env.JARVIS_MONGODB).collection('user_logs').insertOne(log_params);
			})
			.finally(() => {
				fs.rmSync(outputFile, { force: true });
			})
			.catch((err) => {
				logger.error(err);
				throw err;
			});
	});
};
