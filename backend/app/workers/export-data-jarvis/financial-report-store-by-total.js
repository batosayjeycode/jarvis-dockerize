'use strict';

const Q = require('q');

const S3 = require('sociolla-core/lib/aws/s3');
const fs = require('fs');
const writeXlsxFile = require('write-excel-file/node');
const SES = require('sociolla-core/lib/aws/ses');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-financial-report-store-by-total' });
const workerHelpers = require('../../helpers/workerHelper');

module.exports = async (message) => {
	const criteria = message.data.criteria;
	let context = message.data.context;
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
	const document = (criteria.document && JSON.parse(criteria.document)) || {};

	if (!context?.user) {
		context = Object.assign(context || {}, {
			user: {
				name: 'By System',
				email: 'By System',
			},
		});
	}
	logger.info(
		`[${context?.user?.name} - ${context?.user?.email}] Start jarvis export-financial-report-store-by-total`,
	);

	const connEmailLogs = clientMongoDB.db(process.env.MS_SOCIOLLA_MONGODB).collection('email_logs');

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
		const title = document.period_type === 'quarterly' ? `Q${document.quarter}` : 'MTD';
		const template_columns = document.period_type === 'quarterly' ? 1 : 2;
		const HEADER_GRAY = [
			{
				value: 'in IDR Mn',
				topBorderColor: '#000000',
				backgroundColor: '#dadada',
			},
			{
				value: title,
				fontWeight: 'bold',
				backgroundColor: '#dadada',
				leftBorderColor: '#000000',
				topBorderColor: '#000000',
			},
			...generateEmptyObj(4, { topBorderColor: '#000000', backgroundColor: '#dadada' }),
		];

		if (document.period_type === 'monthly') {
			HEADER_GRAY.push({
				value: 'YTD',
				fontWeight: 'bold',
				backgroundColor: '#dadada',
				leftBorderColor: '#000000',
				topBorderColor: '#000000',
			});
			HEADER_GRAY.push(...generateEmptyObj(3, { topBorderColor: '#000000', backgroundColor: '#dadada' }));
			HEADER_GRAY.push({
				backgroundColor: '#dadada',
				rightBorderColor: '#000000',
				topBorderColor: '#000000',
			});
		}

		const HEADER = [
			{
				val: 'Act',
				color: '#000000',
			},
			{
				val: '% Rev',
				color: '#4472c4',
			},
			{
				val: 'Budget',
				color: '#000000',
			},
			{
				val: '% Rev',
				color: '#4472c4',
			},
			{
				val: 'V-B',
				color: '#000000',
				rightBorderColor: '#000000',
			},
		];

		const HEADER_ROW = [
			{
				rightBorderColor: '#000000',
				bottomBorderColor: '#000000',
				backgroundColor: '#dadada',
			},
		];

		const fields_default = [
			{
				key: 'number',
				value: 'NMV',
				column: 'nmv',
				fontWeight: 'bold',
			},
			{
				key: 'number',
				value: 'Net Revenue',
				column: 'net_revenue',
				fontWeight: 'bold',
			},
			{
				key: 'string',
				value: 'Growth %',
				column: 'growth_percent',
			},
			{
				key: 'number',
				value: 'Gross Profit',
				column: 'gross_profit',
				fontWeight: 'bold',
			},
			{
				key: 'string',
				value: '',
				column: 'empty',
			},
			{
				key: 'number',
				value: 'OPEX exc Rental',
				column: 'opex_exc',
				fontWeight: 'bold',
			},
			{
				key: 'number',
				value: 'Fulfillment',
				column: 'fulfillment',
			},
			{
				key: 'number',
				value: 'Payroll',
				column: 'payroll',
			},
			{
				key: 'number',
				value: 'Marketing',
				column: 'marketing',
			},
			{
				key: 'number',
				value: 'G&A Exp',
				column: 'ga',
			},
			{
				key: 'number',
				value: 'Utility Exp',
				column: 'utility',
			},
			{
				key: 'number',
				value: 'EBITDAR',
				column: 'ebitdar',
				fontWeight: 'bold',
			},
			{
				key: 'number',
				value: 'Rental Expense (inc. ROU Amortization)',
				column: 'rental',
			},
			{
				key: 'number',
				value: 'EBITDA',
				column: 'ebitda',
				fontWeight: 'bold',
			},
			{
				key: 'number',
				value: 'Depreciation',
				column: 'depreciation',
			},
			{
				key: 'number',
				value: 'Other Inc/Exp/Fx',
				column: 'other_income',
			},
			{
				key: 'number',
				value: 'Net (Loss) Income',
				column: 'net_loss',
				fontWeight: 'bold',
			},
			{
				key: 'string',
				value: '',
				column: 'empty',
				bottomBorderColor: '#000000',
			},
		];

		for (let i = 0; i < template_columns; i++) {
			HEADER.forEach((row) => {
				const obj = {
					value: row.val,
					color: row.color,
					fontWeight: 'bold',
					backgroundColor: '#dadada',
					bottomBorderColor: '#000000',
					rightBorderColor: row?.rightBorderColor,
				};
				HEADER_ROW.push(obj);
			});
		}

		const data = [[], HEADER_GRAY, HEADER_ROW];

		fields_default.forEach((f) => {
			const ROWS = [
				{
					value: f.value,
					fontWeight: f?.fontWeight,
					rightBorderColor: '#000000',
					bottomBorderColor: f?.bottomBorderColor,
				},
			];

			objects.forEach((row, i) => {
				const color = row.title.includes('%') ? '#4472c4' : '#000000';
				const rightBorderColor = [4, 9].includes(i) ? '#000000' : '';
				ROWS.push({
					value: row[f.column],
					fontWeight: f?.fontWeight,
					color,
					rightBorderColor,
					bottomBorderColor: f?.bottomBorderColor,
					align: 'center',
				});
			});
			data.push(ROWS);
		});

		const columns = [{ width: 35 }, ...generateEmptyObj(11, { width: 15 })];

		return writeXlsxFile(data, {
			columns,
			filePath: outputFile,
			orientation: 'landscape',
		})
			.then(() => {
				logger.info(`[${context?.user?.name} - ${context?.user?.email}] Finish insert to EXCEL`);
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
				logger.info(`[${context?.user?.name} - ${context?.user?.email}] cdnUrl: ${cdnUrl}`);
				const subjectEmail = 'Jarvis : Export Financial Report Store';
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
