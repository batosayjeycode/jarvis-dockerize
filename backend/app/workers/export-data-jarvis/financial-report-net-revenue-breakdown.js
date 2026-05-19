'use strict';

const Q = require('q');

const S3 = require('sociolla-core/lib/aws/s3');
const fs = require('fs');
const writeXlsxFile = require('write-excel-file/node');
const SES = require('sociolla-core/lib/aws/ses');
const moment = require('moment');
const logger = require('sociolla-core/lib/logger').getInstance({
	worker: 'export-financial-report-net-revenue-breakdown',
});
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
	const document = (criteria.document && JSON.parse(criteria.document)) || {};
	const file_name = message.data.file_name || null;

	if (!context?.user) {
		context = Object.assign(context || {}, {
			user: {
				name: 'By System',
				email: 'By System',
			},
		});
	}
	logger.info(
		`[${context?.user?.name} - ${context?.user?.email}] Start jarvis export-financial-report-net-revenue-breakdown`,
	);

	const connEmailLogs = clientMongoDB.db(process.env.MS_SOCIOLLA_MONGODB).collection('email_logs');
	const title = document?.is_task_scheduler ? 'Net Revenue YTD' : 'Export Financial Report Net Revenue';
	const sales_date = document.sales_through_date
		? new Date(moment(document.sales_through_date).format('YYYY-MM-DD'))
		: new Date(moment(document.order_date).subtract(1, 'day').format('YYYY-MM-DD'));
	const YEAR = moment(document.order_date).subtract(1, 'day').format('YYYY');
	const country = document.country === 'vn' ? 'VIETNAM' : 'INDONESIA';
	return Q.try(() => {
		const outputFile = file_name;
		const objects = criteria.queryRow;
		objects.splice(48, 0, { val: 'gray' });

		const generateEmptyObj = (len = 1, obj = {}) => {
			const res = [];
			for (let i = 0; i < len; i++) {
				res.push(obj);
			}
			return res;
		};

		const emptyObjRowTop = generateEmptyObj(54, { topBorderColor: '#000000' });
		const emptyObjRows26 = generateEmptyObj(52);
		const emptyObjRowBot = generateEmptyObj(48, { bottomBorderColor: '#000000' });
		const emptyObjRowsWidth = generateEmptyObj(48, { width: 15 });

		const fieldValue = [
			'empty',
			'leftBorderColor',
			`Sales ${document.country === 'vn' ? 'Vnd' : 'Rp'} Bn`,
			'JAN',
			'BUDGET',
			'VS BUDGET',
			'VS TARGET',
			'FEB',
			'BUDGET',
			'VS BUDGET',
			'VS TARGET',
			'MAR',
			'BUDGET',
			'VS BUDGET',
			'VS TARGET',
			'APR',
			'BUDGET',
			'VS BUDGET',
			'VS TARGET',
			'MAY',
			'BUDGET',
			'VS BUDGET',
			'VS TARGET',
			'JUN',
			'BUDGET',
			'VS BUDGET',
			'VS TARGET',
			'JUL',
			'BUDGET',
			'VS BUDGET',
			'VS TARGET',
			'AUG',
			'BUDGET',
			'VS BUDGET',
			'VS TARGET',
			'SEP',
			'BUDGET',
			'VS BUDGET',
			'VS TARGET',
			'OCT',
			'BUDGET',
			'VS BUDGET',
			'VS TARGET',
			'NOV',
			'BUDGET',
			'VS BUDGET',
			'VS TARGET',
			'DEC',
			'BUDGET',
			'VS BUDGET',
			'VS TARGET',
			'backgroundColor',
			`YTD ${YEAR}`,
			'BUDGET',
			'VS BUDGET',
			'VS TARGET',
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
				value: 'Total Net Revenue TY',
				column: 'total_sales_offline_ty',
				bgcolor: '#fce4d6',
				fontWeight: 'bold',
			},
			{
				key: 'String',
				value: 'Total Net Revenue v LY (%)',
				column: 'total_sales_offline_ly_percent',
				bgcolor: '#fce4d6',
				fontWeight: 'bold',
			},
			{
				key: 'Number',
				value: 'Total Net Revenue LY',
				column: 'total_sales_offline_ly',
			},
			{
				key: 'Number',
				value: 'Total Net Revenue Comp TY',
				column: 'total_sales_offline_ty_store',
				bgcolor: '#fce4d6',
				fontWeight: 'bold',
			},
			{
				key: 'String',
				value: 'Comp stores only (%)',
				column: 'comp_stores_only_percent',
				bgcolor: '#fce4d6',
			},
			{
				key: 'Number',
				value: 'Total Net Revenue Comp LY',
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
				value: 'Total Net Revenue TY',
				column: 'total_sales_online_ty',
				bgcolor: '#fce4d6',
				fontWeight: 'bold',
			},
			{
				key: 'String',
				value: 'Total Net Revenue v LY (%)',
				column: 'total_sales_online_ly_percent',
				bgcolor: '#fce4d6',
				fontWeight: 'bold',
			},
			{
				key: 'Number',
				value: 'Total Net Revenue LY',
				column: 'total_sales_online_ly',
			},
			{
				key: 'Number',
				value: 'Sociolla Online TY',
				column: 'total_sales_sociolla_online_ty',
				bgcolor: '#fce4d6',
				fontWeight: 'bold',
			},
			{
				key: 'String',
				value: 'Sociolla Online v LY (%)',
				column: 'total_sales_sociolla_online_percent',
				bgcolor: '#fce4d6',
				fontWeight: 'bold',
			},
			{
				key: 'Number',
				value: 'Sociolla Online LY',
				column: 'total_sales_sociolla_online_ly',
			},
			{
				key: 'Number',
				value: 'Marketplace TY',
				column: 'total_sales_marketplace_ty',
				bgcolor: '#fce4d6',
				fontWeight: 'bold',
			},
			{
				key: 'String',
				value: 'Marketplace v LY (%)',
				column: 'total_sales_marketplace_percent',
				bgcolor: '#fce4d6',
				fontWeight: 'bold',
			},
			{
				key: 'Number',
				value: 'Marketplace LY',
				column: 'total_sales_marketplace_ly',
			},
			{
				key: 'Number',
				value: 'Shopee TY',
				column: 'total_sales_shopee_ty',
				bgcolor: '#e7e6e6',
				fontWeight: 'bold',
			},
			{
				key: 'String',
				value: 'Shopee v LY (%)',
				column: 'total_sales_shopee_percent',
				bgcolor: '#e7e6e6',
				fontWeight: 'bold',
			},
			{
				key: 'Number',
				value: 'Shopee LY',
				column: 'total_sales_shopee_ly',
			},
			{
				key: 'Number',
				value: 'Tokopedia TY',
				column: 'total_sales_tokopedia_ty',
				bgcolor: '#e7e6e6',
				fontWeight: 'bold',
			},
			{
				key: 'String',
				value: 'Tokopedia v LY (%)',
				column: 'total_sales_tokopedia_percent',
				bgcolor: '#e7e6e6',
				fontWeight: 'bold',
			},
			{
				key: 'Number',
				value: 'Tokopedia LY',
				column: 'total_sales_tokopedia_ly',
			},
			{
				key: 'Number',
				value: 'TikTok TY',
				column: 'total_sales_tiktok_ty',
				bgcolor: '#e7e6e6',
				fontWeight: 'bold',
			},
			{
				key: 'String',
				value: 'TikTok v LY (%)',
				column: 'total_sales_tiktok_percent',
				bgcolor: '#e7e6e6',
				fontWeight: 'bold',
			},
			{
				key: 'Number',
				value: 'TikTok LY',
				column: 'total_sales_tiktok_ly',
			},
			{
				key: 'Number',
				value: 'Lilla Online TY',
				column: 'total_sales_lilla_online_ty',
				bgcolor: '#fce4d6',
				fontWeight: 'bold',
			},
			{
				key: 'String',
				value: 'Lilla Online v LY (%)',
				column: 'total_sales_lilla_online_percent',
				bgcolor: '#fce4d6',
				fontWeight: 'bold',
			},
			{
				key: 'Number',
				value: 'Lilla Online LY',
				column: 'total_sales_lilla_online_ly',
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
				value: 'Total Invoiced Value TY',
				column: 'total_sales_b2b_mt_ty',
				bgcolor: '#fff2cc',
				fontWeight: 'bold',
			},
			{
				key: 'String',
				value: 'Total Invoiced Value v LY (%)',
				column: 'total_sales_b2b_mt_ly_percent',
				bgcolor: '#fff2cc',
				fontWeight: 'bold',
			},
			{
				key: 'Number',
				value: 'Total Invoiced Value LY',
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
				value: 'Total Invoiced Value TY',
				column: 'total_sales_b2b_gt_ty',
				bgcolor: '#fff2cc',
				fontWeight: 'bold',
			},
			{
				key: 'String',
				value: 'Total Invoiced Value v LY (%)',
				column: 'total_sales_b2b_gt_ly_percent',
				bgcolor: '#fff2cc',
			},
			{
				key: 'Number',
				value: 'Total Invoiced Value LY',
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
				value: 'Total Net Revenue TY',
				column: 'total_sales_b2c_ty',
				bgcolor: '#fce4d6',
				fontWeight: 'bold',
			},
			{
				key: 'String',
				value: 'Total Net Revenue v LY (%)',
				column: 'total_sales_b2c_ly_percent',
				bgcolor: '#fce4d6',
				fontWeight: 'bold',
			},
			{
				key: 'Number',
				value: 'Total Net Revenue LY',
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
				value: 'Total Invoiced Value TY',
				column: 'total_sales_b2b_ty',
				bgcolor: '#fff2cc',
				fontWeight: 'bold',
			},
			{
				key: 'String',
				value: 'Total Invoiced Value v LY (%)',
				column: 'total_sales_b2b_ly_percent',
				bgcolor: '#fff2cc',
				fontWeight: 'bold',
			},
			{
				key: 'Number',
				value: 'Total Invoiced Value LY',
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
				value: 'Total Net Revenue TY',
				column: 'total_sales_company_ty',
				bgcolor: '#c9daf8',
				fontWeight: 'bold',
			},
			{
				key: 'String',
				value: 'Total Net Revenue v LY (%)',
				column: 'total_sales_company_ly_percent',
				bgcolor: '#c9daf8',
				fontWeight: 'bold',
			},
			{
				key: 'Number',
				value: 'Total Net Revenue LY',
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
				...emptyObjRowTop,
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
					value: 'NET REVENUE  - ',
					fontWeight: 'bold',
					fontSize: 20,
				},
				{
					value: ' Excl. D&V & VAT',
					fontWeight: 'bold',
					fontSize: 20,
					color: '#ff0000',
				},
				...emptyObjRows26,
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
				...emptyObjRows26,
				{
					rightBorderColor: '#000000',
				},
			],
			[
				{},
				{ leftBorderColor: '#000000' },
				{
					value: country,
					fontWeight: 'bold',
					fontSize: 20,
				},
				...emptyObjRows26,
				{},
				{
					rightBorderColor: '#000000',
				},
			],
			HEADER_ROW,
		];

		fields_default.forEach((f, i) => {
			const leftBorder = i >= 41 && i <= 58 ? { leftBorderColor: '#000000' } : {};
			let rightBorder = i >= 41 && i <= 58 ? { rightBorderColor: '#000000' } : {};
			const topBorder = [41, 58].includes(i) ? { topBorderColor: '#000000' } : {};
			const ROWS = [
				{},
				{ leftBorderColor: '#000000' },
				{ value: f.value, fontWeight: f?.fontWeight, backgroundColor: f?.bgcolor, ...leftBorder, ...topBorder },
			];
			if (['Number', 'String'].includes(f.key)) {
				objects.forEach((row, j) => {
					rightBorder = i >= 41 && i < 58 && j === 52 ? { rightBorderColor: '#000000' } : {};
					const fontWeight = j >= 49 ? { fontWeight: 'bold' } : {};
					if (row?.val === 'gray') {
						ROWS.push({ backgroundColor: '#e7e6e6', ...rightBorder });
					} else if (row[f.column]) {
						if (
							[
								2, 3, 6, 7, 10, 11, 14, 15, 18, 19, 22, 23, 26, 27, 30, 31, 34, 35, 38, 39, 42, 43, 46,
								47, 51, 52,
							].includes(j) ||
							f.key === 'String'
						) {
							const percent_color = parseFloat(row[f.column]) > 0 ? '#0000ff' : '#ff0000';
							ROWS.push({
								value: row[f.column] + '%',
								backgroundColor: f.bgcolor,
								color: percent_color,
								align: 'right',
								...rightBorder,
								...fontWeight,
							});
						} else if (f.key === 'Number') {
							ROWS.push({
								value: parseFloat(row[f.column]),
								type: Number,
								backgroundColor: f.bgcolor,
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
				let index = 0;
				while (index < 48) {
					ROWS.push(topBorder);
					index++;
				}
				ROWS.push({ backgroundColor: '#e7e6e6', ...topBorder });
				ROWS.push(topBorder);
				ROWS.push(topBorder);
				ROWS.push(topBorder);
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
			...emptyObjRowBot,
			{
				backgroundColor: '#e7e6e6',
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
				rightBorderColor: '#000000',
				bottomBorderColor: '#000000',
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
			...emptyObjRowBot,
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
				bottomBorderColor: '#000000',
			},
			{
				bottomBorderColor: '#000000',
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
			{ width: 30 },
			...emptyObjRowsWidth,
			{ width: 4 },
			{ width: 15 },
			{ width: 15 },
			{ width: 15 },
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
				const subjectEmail = `Jarvis - ${title}`;
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
