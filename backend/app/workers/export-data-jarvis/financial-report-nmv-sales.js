'use strict';

const Q = require('q');

const S3 = require('sociolla-core/lib/aws/s3');
const fs = require('fs');
const writeXlsxFile = require('write-excel-file/node');
const SES = require('sociolla-core/lib/aws/ses');
const moment = require('moment');
const YEAR = moment().format('YYYY');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-financial-report-nmv-sales' });
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
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis export-financial-report-nmv-sales`);

	const connEmailLogs = clientMongoDB.db(process.env.MS_SOCIOLLA_MONGODB).collection('email_logs');
	const sales_date = document.sales_through_date
		? new Date(moment(document.sales_through_date).format('YYYY-MM-DD'))
		: new Date(moment(document.order_date).subtract(1, 'day').format('YYYY-MM-DD'));

	return Q.try(() => {
		const outputFile = file_name;
		const objects = criteria.queryRow;
		objects.splice(12, 0, { val: 'gray' });

		const fieldValue = [
			'empty',
			'leftBorderColor',
			'Sales Rp Bn',
			'JAN',
			'FEB',
			'MAR',
			'APR',
			'MAY',
			'JUN',
			'JUL',
			'AUG',
			'SEP',
			'OCT',
			'NOV',
			'DEC',
			'backgroundColor',
			`YTD ${YEAR}`,
			'rightBorderColor',
		];

		const HEADER_ROW = fieldValue.map((el) => {
			if (el === 'empty') {
				return {};
			} else if (['leftBorderColor', 'rightBorderColor'].includes(el)) {
				return {
					[el]: '#000000',
				};
			} else if (el === 'backgroundColor') {
				return { backgroundColor: '#e7e6e6' };
			} else {
				return {
					value: el,
					fontWeight: 'bold',
					color: '#000000',
					backgroundColor: '#ffff00',
					borderColor: '#000000',
					align: 'center',
				};
			}
		});

		const fields_default = [
			{
				key: 'header',
				value: 'B2C OFFLINE',
				fontWeight: 'bold',
			},
			{
				key: 'Number',
				value: 'Total Sales TY',
				column: 'total_sales_offline_ty',
				bgcolor: '#fce4d6',
				fontWeight: 'bold',
			},
			{
				key: 'String',
				value: 'Total Sales v LY (%)',
				column: 'total_sales_offline_ly_percent',
				bgcolor: '#fce4d6',
				fontWeight: 'bold',
			},
			{
				key: 'Number',
				value: 'Total Sales LY',
				column: 'total_sales_offline_ly',
			},
			{
				key: 'Number',
				value: 'Total Sales Comp TY',
				column: 'total_sales_offline_ty_store',
				bgcolor: '#fce4d6',
			},
			{
				key: 'String',
				value: 'Comp stores only (%)',
				column: 'comp_stores_only_percent',
				bgcolor: '#fce4d6',
			},
			{
				key: 'Number',
				value: 'Total Sales Comp LY',
				column: 'total_sales_offline_ly_store',
			},
			{
				key: 'space',
				value: '',
			},
			{
				key: 'header',
				value: 'B2C ONLINE',
				fontWeight: 'bold',
			},
			{
				key: 'Number',
				value: 'Total Sales TY',
				column: 'total_sales_online_ty',
				bgcolor: '#fce4d6',
				fontWeight: 'bold',
			},
			{
				key: 'String',
				value: 'Total Sales v LY (%)',
				column: 'total_sales_online_ly_percent',
				bgcolor: '#fce4d6',
				fontWeight: 'bold',
			},
			{
				key: 'Number',
				value: 'Total Sales LY',
				column: 'total_sales_online_ly',
			},
			{
				key: 'space',
				value: '',
			},
			{
				key: 'header',
				value: 'B2B MT',
				fontWeight: 'bold',
			},
			{
				key: 'Number',
				value: 'Total Sales TY',
				column: 'total_sales_b2b_mt_ty',
				bgcolor: '#fff2cc',
				fontWeight: 'bold',
			},
			{
				key: 'String',
				value: 'Total Sales v LY (%)',
				column: 'total_sales_b2b_mt_ly_percent',
				bgcolor: '#fff2cc',
				fontWeight: 'bold',
			},
			{
				key: 'Number',
				value: 'Total Sales LY',
				column: 'total_sales_b2b_mt_ly',
			},
			{
				key: 'space',
				value: '',
			},
			{
				key: 'header',
				value: 'B2B GT',
				fontWeight: 'bold',
			},
			{
				key: 'Number',
				value: 'Total Sales TY',
				column: 'total_sales_b2b_gt_ty',
				bgcolor: '#fff2cc',
				fontWeight: 'bold',
			},
			{
				key: 'String',
				value: 'Total Sales v LY (%)',
				column: 'total_sales_b2b_gt_ly_percent',
				bgcolor: '#fff2cc',
			},
			{
				key: 'Number',
				value: 'Total Sales LY',
				column: 'total_sales_b2b_gt_ly',
			},
			{
				key: 'space',
				value: '',
			},
			{
				key: 'space',
				value: '',
			},
			{
				key: 'header',
				value: 'TOTAL B2C',
				fontWeight: 'bold',
			},
			{
				key: 'Number',
				value: 'Total Sales TY',
				column: 'total_sales_b2c_ty',
				bgcolor: '#fce4d6',
				fontWeight: 'bold',
			},
			{
				key: 'String',
				value: 'Total Sales v LY (%)',
				column: 'total_sales_b2c_ly_percent',
				bgcolor: '#fce4d6',
				fontWeight: 'bold',
			},
			{
				key: 'Number',
				value: 'Total Sales LY',
				column: 'total_sales_b2c_ly',
			},
			{
				key: 'space',
				value: '',
			},
			{
				key: 'header',
				value: 'TOTAL B2B',
				fontWeight: 'bold',
			},
			{
				key: 'Number',
				value: 'Total Sales TY',
				column: 'total_sales_b2b_ty',
				bgcolor: '#fff2cc',
				fontWeight: 'bold',
			},
			{
				key: 'String',
				value: 'Total Sales v LY (%)',
				column: 'total_sales_b2b_ly_percent',
				bgcolor: '#fff2cc',
				fontWeight: 'bold',
			},
			{
				key: 'Number',
				value: 'Total Sales LY',
				column: 'total_sales_b2b_ly',
			},
			{
				key: 'space',
				value: '',
			},
			{
				key: 'space',
				value: '',
			},
			{
				key: 'header',
				value: 'TOTAL COMPANY',
				fontWeight: 'bold',
			},
			{
				key: 'Number',
				value: 'Total Sales TY',
				column: 'total_sales_company_ty',
				bgcolor: '#c9daf8',
				fontWeight: 'bold',
			},
			{
				key: 'String',
				value: 'Total Sales v LY (%)',
				column: 'total_sales_company_ly_percent',
				bgcolor: '#c9daf8',
				fontWeight: 'bold',
			},
			{
				key: 'Number',
				value: 'Total Sales LY',
				column: 'total_sales_company_ly',
			},
		];
		const data = [
			[],
			[
				{},
				{
					leftBorderColor: '#000000',
					topBorderColor: '#000000',
				},
				{
					topBorderColor: '#000000',
				},
				{
					topBorderColor: '#000000',
				},
				{
					topBorderColor: '#000000',
				},
				{
					topBorderColor: '#000000',
				},
				{
					topBorderColor: '#000000',
				},
				{
					topBorderColor: '#000000',
				},
				{
					topBorderColor: '#000000',
				},
				{
					topBorderColor: '#000000',
				},
				{
					topBorderColor: '#000000',
				},
				{
					topBorderColor: '#000000',
				},
				{
					topBorderColor: '#000000',
				},
				{
					topBorderColor: '#000000',
				},
				{
					topBorderColor: '#000000',
				},
				{
					topBorderColor: '#000000',
				},
				{
					topBorderColor: '#000000',
				},
				{
					topBorderColor: '#000000',
					rightBorderColor: '#000000',
				},
			],
			[
				{},
				{
					leftBorderColor: '#000000',
				},
				{
					value: 'NMV Sales - (before deducting VAT/Disc & Vouch)',
					fontWeight: 'bold',
					fontSize: 20,
				},
				{},
				{},
				{},
				{},
				{},
				{},
				{},
				{},
				{},
				{},
				{},
				{},
				{},
				{},
				{
					rightBorderColor: '#000000',
				},
			],
			[
				{},
				{ leftBorderColor: '#000000' },
				{
					value: 'Sales through:',
				},
				{
					value: sales_date,
					color: '#ff0000',
					type: Date,
					format: 'dd-mmm-yyyy',
				},
				{},
				{},
				{},
				{},
				{},
				{},
				{},
				{},
				{},
				{},
				{},
				{},
				{},
				{
					rightBorderColor: '#000000',
				},
			],
			[
				{},
				{ leftBorderColor: '#000000' },
				{
					value: 'INDONESIA',
					fontWeight: 'bold',
					fontSize: 20,
				},
				{},
				{},
				{},
				{},
				{},
				{},
				{},
				{},
				{},
				{},
				{},
				{},
				{},
				{},
				{
					rightBorderColor: '#000000',
				},
			],
			HEADER_ROW,
		];

		fields_default.forEach((f, i) => {
			const leftBorder = i >= 23 && i <= 40 ? { leftBorderColor: '#000000' } : {};
			let rightBorder = i >= 23 && i <= 40 ? { rightBorderColor: '#000000' } : {};
			const topBorder = [23, 34].includes(i) ? { topBorderColor: '#000000' } : {};
			const ROWS = [
				{},
				{ leftBorderColor: '#000000' },
				{ value: f.value, fontWeight: f?.fontWeight, backgroundColor: f?.bgcolor, ...leftBorder, ...topBorder },
			];
			if (['Number', 'String'].includes(f.key)) {
				objects.map((row, j) => {
					rightBorder = i >= 23 && i < 40 && j === 13 ? { rightBorderColor: '#000000' } : {};
					const fontWeight = j === 13 ? { fontWeight: 'bold' } : {};
					if (row?.val === 'gray') {
						ROWS.push({ backgroundColor: '#e7e6e6', ...rightBorder });
					} else if (row[f.column]) {
						if (f.key === 'Number') {
							ROWS.push({
								value: parseFloat(row[f.column]),
								type: Number,
								backgroundColor: f.bgcolor,
								align: 'right',
								...rightBorder,
								...fontWeight,
							});
						} else {
							const percent_color = parseFloat(row[f.column]) > 0 ? '#0000ff' : '#ff0000';
							ROWS.push({
								value: row[f.column] + '%',
								backgroundColor: f.bgcolor,
								color: percent_color,
								align: 'right',
								...rightBorder,
								...fontWeight,
							});
						}
					} else {
						ROWS.push({ value: '', backgroundColor: f.bgcolor, ...rightBorder });
					}
				});
				ROWS.push({
					rightBorderColor: '#000000',
				});
			} else {
				ROWS.push(topBorder);
				ROWS.push(topBorder);
				ROWS.push(topBorder);
				ROWS.push(topBorder);
				ROWS.push(topBorder);
				ROWS.push(topBorder);
				ROWS.push(topBorder);
				ROWS.push(topBorder);
				ROWS.push(topBorder);
				ROWS.push(topBorder);
				ROWS.push(topBorder);
				ROWS.push(topBorder);
				ROWS.push({ backgroundColor: '#e7e6e6', ...topBorder });
				ROWS.push({ ...rightBorder, ...topBorder });
				ROWS.push({ rightBorderColor: '#000000' });
			}
			data.push(ROWS);
		});

		data.push([
			{},
			{
				leftBorderColor: '#000000',
			},
			{
				leftBorderColor: '#000000',
				bottomBorderColor: '#000000',
			},
			{
				bottomBorderColor: '#000000',
			},
			{
				bottomBorderColor: '#000000',
			},
			{
				bottomBorderColor: '#000000',
			},
			{
				bottomBorderColor: '#000000',
			},
			{
				bottomBorderColor: '#000000',
			},
			{
				bottomBorderColor: '#000000',
			},
			{
				bottomBorderColor: '#000000',
			},
			{
				bottomBorderColor: '#000000',
			},
			{
				bottomBorderColor: '#000000',
			},
			{
				bottomBorderColor: '#000000',
			},
			{
				bottomBorderColor: '#000000',
			},
			{
				bottomBorderColor: '#000000',
			},
			{
				backgroundColor: '#e7e6e6',
				bottomBorderColor: '#000000',
			},
			{
				bottomBorderColor: '#000000',
				rightBorderColor: '#000000',
			},
			{
				rightBorderColor: '#000000',
			},
		]);
		data.push([
			{},
			{
				leftBorderColor: '#000000',
				bottomBorderColor: '#000000',
			},
			{
				bottomBorderColor: '#000000',
			},
			{
				bottomBorderColor: '#000000',
			},
			{
				bottomBorderColor: '#000000',
			},
			{
				bottomBorderColor: '#000000',
			},
			{
				bottomBorderColor: '#000000',
			},
			{
				bottomBorderColor: '#000000',
			},
			{
				bottomBorderColor: '#000000',
			},
			{
				bottomBorderColor: '#000000',
			},
			{
				bottomBorderColor: '#000000',
			},
			{
				bottomBorderColor: '#000000',
			},
			{
				bottomBorderColor: '#000000',
			},
			{
				bottomBorderColor: '#000000',
			},
			{
				bottomBorderColor: '#000000',
			},
			{
				bottomBorderColor: '#000000',
				backgroundColor: '#e7e6e6',
			},
			{
				bottomBorderColor: '#000000',
			},
			{
				rightBorderColor: '#000000',
				bottomBorderColor: '#000000',
			},
		]);

		const columns = [
			{ width: 4 },
			{ width: 4 },
			{ width: 20 },
			{ width: 15 },
			{ width: 15 },
			{ width: 15 },
			{ width: 15 },
			{ width: 15 },
			{ width: 15 },
			{ width: 15 },
			{ width: 15 },
			{ width: 15 },
			{ width: 15 },
			{ width: 15 },
			{ width: 15 },
			{ width: 4 },
			{ width: 15 },
			{ width: 4 },
		];

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
				const subjectEmail = 'Jarvis : Export Financial Report NMV Sales';
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
