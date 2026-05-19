'use strict';

const Q = require('q');

const S3 = require('sociolla-core/lib/aws/s3');
const fs = require('fs');
const writeXlsxFile = require('write-excel-file/node');
const SES = require('sociolla-core/lib/aws/ses');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-financial-report-store-by-store' });
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
		`[${context?.user?.name} - ${context?.user?.email}] Start jarvis export-financial-report-store-by-store`,
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
				backgroundColor: '#dadada',
				topBorderColor: '#000000',
				leftBorderColor: '#000000',
			},
			...generateEmptyObj(3, { topBorderColor: '#000000', backgroundColor: '#dadada' }),
			{
				value: title,
				fontWeight: 'bold',
				backgroundColor: '#dadada',
				leftBorderColor: '#000000',
				topBorderColor: '#000000',
			},
			...generateEmptyObj(19, { topBorderColor: '#000000', backgroundColor: '#dadada' }),
			{
				backgroundColor: '#dadada',
				rightBorderColor: '#000000',
				topBorderColor: '#000000',
			},
		];

		if (document.period_type === 'monthly') {
			HEADER_GRAY.push({
				value: 'YTD',
				fontWeight: 'bold',
				backgroundColor: '#dadada',
				leftBorderColor: '#000000',
				topBorderColor: '#000000',
			});
			HEADER_GRAY.push(...generateEmptyObj(19, { topBorderColor: '#000000', backgroundColor: '#dadada' }));
			HEADER_GRAY.push({
				backgroundColor: '#dadada',
				rightBorderColor: '#000000',
				topBorderColor: '#000000',
			});
		}

		const HEADER = [
			{
				val: 'NMV',
				is_bold: true,
			},
			{
				val: 'Net Revenue',
				is_bold: true,
			},
			{
				val: 'Growth %',
				is_bold: false,
			},
			{
				val: 'Gross Profit',
				is_bold: true,
			},
			{
				val: 'GP %',
				is_bold: true,
			},
			{
				val: 'OPEX exc Rental',
				is_bold: true,
			},
			{
				val: 'Opex %',
				is_bold: true,
			},
			{
				val: 'Fulfillment',
				is_bold: false,
			},
			// {
			// 	val: 'Service Charge Mall',
			// 	is_bold: false,
			// },
			{
				val: 'Payroll',
				is_bold: false,
			},
			{
				val: 'Marketing',
				is_bold: false,
			},
			{
				val: 'G&A Exp',
				is_bold: false,
			},
			{
				val: 'Utility Exp',
				is_bold: false,
			},
			{
				val: 'EBITDAR',
				is_bold: true,
			},
			{
				val: 'EBITDAR Margin %',
				is_bold: false,
			},
			{
				val: 'Rental (ROU calculation)',
				is_bold: false,
			},
			{
				val: 'EBITDA',
				is_bold: true,
			},
			{
				val: 'EBITDA Margin %',
				is_bold: false,
			},
			{
				val: 'Depreciation',
				is_bold: false,
			},
			{
				val: 'Other Income Expense',
				is_bold: false,
			},
			{
				val: 'Net (Loss) Income',
				is_bold: true,
			},
			{
				val: 'Net Income Margin %',
				is_bold: false,
			},
		];

		const HEADER_ROW = [
			{
				value: 'Store Alias',
				fontWeight: 'bold',
				rightBorderColor: '#000000',
			},
			{
				value: 'Store Name',
				fontWeight: 'bold',
				rightBorderColor: '#000000',
			},
			{
				value: 'Opening Date',
				fontWeight: 'bold',
				rightBorderColor: '#000000',
			},
			{
				value: 'City',
				fontWeight: 'bold',
				rightBorderColor: '#000000',
			},
			{
				value: 'Province',
				fontWeight: 'bold',
				rightBorderColor: '#000000',
			},
		];

		let fields_default_ytd = [];

		if (document.period_type === 'monthly') {
			fields_default_ytd = [
				{
					key: 'number',
					value: 'ytd_nmv',
					fontWeight: 'bold',
				},
				{
					key: 'number',
					value: 'ytd_net_revenue',
					fontWeight: 'bold',
				},
				{
					key: 'string',
					value: 'ytd_growth',
				},
				{
					key: 'number',
					value: 'ytd_gross_profit',
					fontWeight: 'bold',
				},
				{
					key: 'string',
					value: 'ytd_gp_percent',
					fontWeight: 'bold',
				},
				{
					key: 'number',
					value: 'ytd_opex_exc',
					fontWeight: 'bold',
				},
				{
					key: 'string',
					value: 'ytd_opex_percent',
				},
				{
					key: 'number',
					value: 'ytd_fulfillment',
				},
				{
					key: 'number',
					value: 'ytd_payroll',
				},
				{
					key: 'number',
					value: 'ytd_marketing',
				},
				{
					key: 'number',
					value: 'ytd_ga',
				},
				{
					key: 'number',
					value: 'ytd_utility',
				},
				{
					key: 'number',
					value: 'ytd_ebitdar',
					fontWeight: 'bold',
				},
				{
					key: 'string',
					value: 'ytd_ebitdar_percent',
				},
				{
					key: 'number',
					value: 'ytd_rental',
				},
				{
					key: 'number',
					value: 'ytd_ebitda',
					fontWeight: 'bold',
				},
				{
					key: 'string',
					value: 'ytd_ebitda_percent',
				},
				{
					key: 'number',
					value: 'ytd_depreciation',
				},
				{
					key: 'number',
					value: 'ytd_other_income',
				},
				{
					key: 'number',
					value: 'ytd_net_loss',
					fontWeight: 'bold',
				},
				{
					key: 'string',
					value: 'ytd_net_income_margin_percent',
				},
			];
		}

		const fields_default = [
			// MTD
			{
				key: 'string',
				value: 'store_alias',
			},
			{
				key: 'string',
				value: 'store_name',
			},
			{
				key: 'date',
				value: 'opening_date',
			},
			{
				key: 'string',
				value: 'city',
			},
			{
				key: 'string',
				value: 'province',
				fontWeight: 'bold',
			},
			{
				key: 'number',
				value: 'nmv',
				fontWeight: 'bold',
			},
			{
				key: 'number',
				value: 'net_revenue',
				fontWeight: 'bold',
			},
			{
				key: 'string',
				value: 'growth',
			},
			{
				key: 'number',
				value: 'gross_profit',
				fontWeight: 'bold',
			},
			{
				key: 'string',
				value: 'gp_percent',
				fontWeight: 'bold',
			},
			{
				key: 'number',
				value: 'opex_exc',
				fontWeight: 'bold',
			},
			{
				key: 'string',
				value: 'opex_percent',
			},
			{
				key: 'number',
				value: 'fulfillment',
			},
			{
				key: 'number',
				value: 'payroll',
			},
			{
				key: 'number',
				value: 'marketing',
			},
			{
				key: 'number',
				value: 'ga',
			},
			{
				key: 'number',
				value: 'utility',
			},
			{
				key: 'number',
				value: 'ebitdar',
				fontWeight: 'bold',
			},
			{
				key: 'string',
				value: 'ebitdar_percent',
			},
			{
				key: 'number',
				value: 'rental',
			},
			{
				key: 'number',
				value: 'ebitda',
				fontWeight: 'bold',
			},
			{
				key: 'string',
				value: 'ebitda_percent',
			},
			{
				key: 'number',
				value: 'depreciation',
			},
			{
				key: 'number',
				value: 'other_income',
			},
			{
				key: 'number',
				value: 'net_loss',
				fontWeight: 'bold',
			},
			{
				key: 'string',
				value: 'net_income_margin_percent',
			},

			// YTD
			...fields_default_ytd,
		];

		for (let i = 0; i < template_columns; i++) {
			HEADER.forEach((row) => {
				const obj = {
					value: row.val,
					rightBorderColor: '#000000',
				};
				if (row.is_bold) {
					obj['fontWeight'] = 'bold';
				}
				HEADER_ROW.push(obj);
			});
		}

		const data = [[], HEADER_GRAY, HEADER_ROW];
		objects.forEach((row, i) => {
			const ROWS = [];
			const index = i + 1;
			const bottomBorderColor = objects.length == index ? { bottomBorderColor: '#000000' } : {};
			fields_default.forEach((f) => {
				const fontWeight = f.fontWeight ? { fontWeight: 'bold' } : {};

				if (f.key === 'date') {
					ROWS.push({
						value: new Date(row[f.value]),
						type: Date,
						format: 'yyyy-mm-dd',
						rightBorderColor: '#000000',
						...fontWeight,
						...bottomBorderColor,
					});
				} else if (f.key === 'number') {
					ROWS.push({
						value: parseFloat(row[f.value]),
						type: Number,
						rightBorderColor: '#000000',
						...fontWeight,
						...bottomBorderColor,
					});
				} else {
					ROWS.push({
						value: row[f.value],
						rightBorderColor: '#000000',
						...fontWeight,
						...bottomBorderColor,
					});
				}
			});
			data.push(ROWS);
		});

		const columns = [{ width: 10 }, { width: 35 }, ...generateEmptyObj(46, { width: 20 })];

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
