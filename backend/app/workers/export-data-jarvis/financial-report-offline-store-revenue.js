'use strict';

const Q = require('q');

const S3 = require('sociolla-core/lib/aws/s3');
const fs = require('fs');
const writeXlsxFile = require('write-excel-file/node');
const SES = require('sociolla-core/lib/aws/ses');
const moment = require('moment');
const logger = require('sociolla-core/lib/logger').getInstance({
	worker: 'export-financial-report-offline-store-revenue',
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
		`[${context?.user?.name} - ${context?.user?.email}] Start jarvis export-financial-report-offline-store-revenue`,
	);

	const connEmailLogs = clientMongoDB.db(process.env.MS_SOCIOLLA_MONGODB).collection('email_logs');
	const sales_date = document.sales_through_date
		? new Date(moment(document.sales_through_date).format('YYYY-MM-DD'))
		: new Date(moment(document.order_date).subtract(1, 'day').format('YYYY-MM-DD'));
	const country = context?.user?.country === 'vn' ? 'VIETNAM' : 'INDONESIA';
	const country_code = context?.user?.country === 'vn' ? 'VN' : 'ID';

	return Q.try(() => {
		const outputFile = file_name;
		const {
			comp_stores,
			non_comp_stores,
			unopened_stores,
			subtotal_comp_stores,
			subtotal_non_comp_stores,
			grand_total,
		} = criteria.queryRow;
		const doc = document;
		const div = doc.currency === 'USD' ? "('000)" : "('000,000)";
		const generateEmptyObj = (len = 1, obj = {}) => {
			const res = [];
			for (let i = 0; i < len; i++) {
				res.push(obj);
			}
			return res;
		};
		const fieldInfo = ['store', 'store_alias', 'opening_date', 'store_size', 'city', 'province'];
		const fieldValue = [
			'jan_sales',
			'jan_budgets',
			'jan_vs_target_budget_ty',
			'jan_vs_target',
			'jan_growth',
			'feb_sales',
			'feb_budgets',
			'feb_vs_target_budget_ty',
			'feb_vs_target',
			'feb_growth',
			'mar_sales',
			'mar_budgets',
			'mar_vs_target_budget_ty',
			'mar_vs_target',
			'mar_growth',
			'apr_sales',
			'apr_budgets',
			'apr_vs_target_budget_ty',
			'apr_vs_target',
			'apr_growth',
			'may_sales',
			'may_budgets',
			'may_vs_target_budget_ty',
			'may_vs_target',
			'may_growth',
			'jun_sales',
			'jun_budgets',
			'jun_vs_target_budget_ty',
			'jun_vs_target',
			'jun_growth',
			'jul_sales',
			'jul_budgets',
			'jul_vs_target_budget_ty',
			'jul_vs_target',
			'jul_growth',
			'aug_sales',
			'aug_budgets',
			'aug_vs_target_budget_ty',
			'aug_vs_target',
			'aug_growth',
			'sep_sales',
			'sep_budgets',
			'sep_vs_target_budget_ty',
			'sep_vs_target',
			'sep_growth',
			'oct_sales',
			'oct_budgets',
			'oct_vs_target_budget_ty',
			'oct_vs_target',
			'oct_growth',
			'nov_sales',
			'nov_budgets',
			'nov_vs_target_budget_ty',
			'nov_vs_target',
			'nov_growth',
			'dec_sales',
			'dec_budgets',
			'dec_vs_target_budget_ty',
			'dec_vs_target',
			'dec_growth',
			'ytd',
			'ytd_tb',
			'ytd_vs_target_budget_ty',
			'ytd_vs_target',
			'ytd_growth',
		];
		const headerValue = fieldValue.map((el) => {
			let val = '-';
			if (el.includes('_sales')) {
				val = el.split('_')?.[0] || '-';
				val = val.toUpperCase();
			} else if (el.includes('_growth')) {
				val = 'Growth %';
			} else if (el.includes('_vs_target_budget_ty')) {
				val = 'vs Budget';
			} else if (el.includes('_budgets') || el.includes('ytd_tb')) {
				val = 'Budget';
			} else if (el.includes('_vs_target')) {
				val = 'vs Target';
			} else if (el.includes('ytd')) {
				val = 'YTD';
			}
			return {
				value: val,
				fontWeight: 'bold',
				color: '#000000',
				backgroundColor: '#ffff00',
				bottomBorderColor: '#000000',
				align: 'center',
			};
		});
		const HEADER_ROW = [
			{},
			{
				leftBorderColor: '#000000',
			},
			{
				value: `Sales ${doc.currency} ${div}`,
				fontWeight: 'bold',
				color: '#000000',
				backgroundColor: '#ffff00',
				bottomBorderColor: '#000000',
				align: 'center',
			},
			{
				backgroundColor: '#ffff00',
				bottomBorderColor: '#000000',
				align: 'center',
			},
			{
				backgroundColor: '#ffff00',
				bottomBorderColor: '#000000',
				align: 'center',
			},
			{
				backgroundColor: '#ffff00',
				bottomBorderColor: '#000000',
				align: 'center',
			},
			{
				backgroundColor: '#ffff00',
				bottomBorderColor: '#000000',
				align: 'center',
			},
			{
				backgroundColor: '#ffff00',
				bottomBorderColor: '#000000',
				align: 'center',
				rightBorderColor: '#000000',
			},
			...headerValue,
			{
				rightBorderColor: '#000000',
			},
		];

		const emptyObjRow1 = generateEmptyObj(71);
		const emptyObjRow2 = generateEmptyObj(71, { topBorderColor: '#000000' });
		const emptyObjRow3 = generateEmptyObj(69);
		const emptyObjRow4 = generateEmptyObj(70);
		const emptyObjRow5 = generateEmptyObj(65);
		const emptyObjRow6 = generateEmptyObj(65, { width: 15 });
		const emptyObjRow7 = generateEmptyObj(65, { backgroundColor: '#c9daf8' });
		const emptyObjRow8 = generateEmptyObj(65, { bottomBorderColor: '#000000' });
		const emptyObjRow9 = generateEmptyObj(65);

		const data = [
			[
				...emptyObjRow1,
				{
					value: 'Currency:',
					fontWeight: 'bold',
				},
				{
					value: doc.currency,
					fontWeight: 'bold',
				},
				{},
			],
			[
				{},
				{
					leftBorderColor: '#000000',
					topBorderColor: '#000000',
				},
				...emptyObjRow2,
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
					value: 'OFFLINE STORE SALES  -',
					fontWeight: 'bold',
					fontSize: 20,
				},
				{
					value: ' Excl. D&V & VAT',
					fontWeight: 'bold',
					fontSize: 20,
					color: '#ff0000',
				},
				...emptyObjRow3,
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
				...emptyObjRow3,
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
				...emptyObjRow4,
				{
					rightBorderColor: '#000000',
				},
			],
			HEADER_ROW,
			[
				{},
				{ leftBorderColor: '#000000' },
				{
					value: 'Store',
					fontWeight: 'bold',
					fontSize: 20,
				},
				{
					value: 'Store Alias',
					fontWeight: 'bold',
					fontSize: 20,
				},
				{
					value: 'Opening Date',
					fontWeight: 'bold',
					fontSize: 20,
				},
				{
					value: 'Store Size',
					fontWeight: 'bold',
					fontSize: 20,
				},
				{
					value: 'City',
					fontWeight: 'bold',
					fontSize: 20,
				},
				{
					value: 'Province',
					fontWeight: 'bold',
					fontSize: 20,
					rightBorderColor: '#000000',
				},
				...emptyObjRow9,
				{
					rightBorderColor: '#000000',
				},
			],
		];

		const genFieldInfo = (obj, opt = { backgroundColor: '#fce4d6' }) => {
			return fieldInfo.map((el) => {
				let newObj = {
					value: obj[el] || '-',
					...opt,
				};
				if (el === 'opening_date') {
					newObj = {
						...newObj,
						value: obj[el] ? new Date(obj[el]) : '',
						type: Date,
						format: 'dd mmm yyyy',
					};
				} else if (el === 'store_size') {
					newObj = {
						...newObj,
						align: 'center',
					};
				} else if (el === 'city') {
					newObj = {
						...newObj,
					};
				} else if (el === 'province') {
					newObj = {
						...newObj,
						rightBorderColor: '#000000',
					};
				} else {
					newObj = { ...newObj, fontWeight: 'bold' };
				}
				return newObj;
			});
		};

		const genFieldValue = (obj, opt = { backgroundColor: '#fce4d6' }) => {
			return fieldValue.map((el) => {
				let newObj = {
					value: 0,
					align: 'right',
					...opt,
				};
				if (el.includes('_growth') || el.includes('_vs_target') || el.includes('_vs_target_budget_ty')) {
					let color = '#656565';
					if (obj[el] && obj[el].toString().includes('%')) {
						obj[el] = obj[el].toString().replace('%', '');
						obj[el] = parseFloat(obj[el]) || 0;
						if (obj[el] > 0) {
							color = '#0000ff';
						} else if (obj[el] < 0) {
							color = '#ff0000';
						}
					} else {
						obj[el] = 0;
					}
					if (obj[el]) {
						obj[el] = parseFloat(obj[el]).toFixed(1);
					}
					newObj = { ...newObj, value: `${obj[el]}%`, color };
				} else {
					newObj = { ...newObj, value: parseFloat(obj[el] || 0), type: Number };
				}
				return newObj;
			});
		};

		comp_stores.forEach((row) => {
			const genField = genFieldInfo(row);
			const genFieldVal = genFieldValue(row);
			data.push([
				{},
				{ leftBorderColor: '#000000' },
				...genField,
				...genFieldVal,
				{
					rightBorderColor: '#000000',
				},
			]);
		});

		non_comp_stores.forEach((row) => {
			const genField = genFieldInfo(row, { backgroundColor: '#fce4d6' });
			const genFieldVal = genFieldValue(row, { backgroundColor: '#fce4d6' });
			data.push([
				{},
				{ leftBorderColor: '#000000' },
				...genField,
				...genFieldVal,
				{
					rightBorderColor: '#000000',
				},
			]);
		});

		data.push([
			{},
			{ leftBorderColor: '#000000' },
			{
				value: 'Unopened Store',
				fontWeight: 'bold',
				fontSize: 20,
			},
			{
				value: 'Store Alias',
				fontWeight: 'bold',
				fontSize: 20,
			},
			{
				value: 'Opening Date',
				fontWeight: 'bold',
				fontSize: 20,
			},
			{
				value: 'Store Size',
				fontWeight: 'bold',
				fontSize: 20,
			},
			{
				value: 'City',
				fontWeight: 'bold',
				fontSize: 20,
			},
			{
				value: 'Province',
				fontWeight: 'bold',
				fontSize: 20,
				rightBorderColor: '#000000',
			},
			...emptyObjRow9,
			{
				rightBorderColor: '#000000',
			},
		]);

		unopened_stores.forEach((row) => {
			const genField = genFieldInfo(row, { backgroundColor: '#fce4d6' });
			const genFieldVal = genFieldValue(row, { backgroundColor: '#fce4d6' });
			data.push([
				{},
				{ leftBorderColor: '#000000' },
				...genField,
				...genFieldVal,
				{
					rightBorderColor: '#000000',
				},
			]);
		});

		const genFieldValSubTotalCompStore = genFieldValue(subtotal_comp_stores, { backgroundColor: '#fff2cc' });
		data.push([
			{},
			{ leftBorderColor: '#000000' },
			{
				value: subtotal_comp_stores.store,
				backgroundColor: '#fff2cc',
				fontWeight: 'bold',
			},
			{
				backgroundColor: '#fff2cc',
				align: 'right',
			},
			{
				backgroundColor: '#fff2cc',
				align: 'right',
			},
			{
				backgroundColor: '#fff2cc',
				align: 'right',
			},
			{
				backgroundColor: '#fff2cc',
				align: 'right',
			},
			{
				backgroundColor: '#fff2cc',
				align: 'right',
				rightBorderColor: '#000000',
			},
			...genFieldValSubTotalCompStore,
			{
				rightBorderColor: '#000000',
			},
		]);

		const genFieldValSubTotalNonCompStore = genFieldValue(subtotal_non_comp_stores, { backgroundColor: '#fff2cc' });
		data.push([
			{},
			{ leftBorderColor: '#000000' },
			{
				value: subtotal_non_comp_stores.store,
				backgroundColor: '#fff2cc',
				fontWeight: 'bold',
			},
			{
				backgroundColor: '#fff2cc',
				align: 'right',
			},
			{
				backgroundColor: '#fff2cc',
				align: 'right',
			},
			{
				backgroundColor: '#fff2cc',
				align: 'right',
			},
			{
				backgroundColor: '#fff2cc',
				align: 'right',
			},
			{
				backgroundColor: '#fff2cc',
				align: 'right',
				rightBorderColor: '#000000',
			},
			...genFieldValSubTotalNonCompStore,
			{
				rightBorderColor: '#000000',
			},
		]);
		data.push([
			{},
			{ leftBorderColor: '#000000' },
			{},
			{},
			{},
			{},
			{},
			{
				rightBorderColor: '#000000',
			},
			...emptyObjRow5,
			{
				rightBorderColor: '#000000',
			},
		]);
		data.push([
			{},
			{ leftBorderColor: '#000000' },
			{
				value: 'Total',
				fontWeight: 'bold',
			},
			{},
			{},
			{},
			{},
			{
				rightBorderColor: '#000000',
			},
			...emptyObjRow5,
			{
				rightBorderColor: '#000000',
			},
		]);
		const genFieldValGrandTotal = genFieldValue(grand_total, { backgroundColor: '#c9daf8' });
		data.push([
			{},
			{ leftBorderColor: '#000000' },
			{
				value: grand_total.store,
				backgroundColor: '#c9daf8',
				fontWeight: 'bold',
			},
			{
				backgroundColor: '#c9daf8',
				align: 'right',
			},
			{
				backgroundColor: '#c9daf8',
				align: 'right',
			},
			{
				backgroundColor: '#c9daf8',
				align: 'right',
			},
			{
				backgroundColor: '#c9daf8',
				align: 'right',
			},
			{
				rightBorderColor: '#000000',

				backgroundColor: '#c9daf8',
				align: 'right',
			},
			...genFieldValGrandTotal,
			{
				rightBorderColor: '#000000',
			},
		]);
		data.push([
			{},
			{ leftBorderColor: '#000000' },
			{
				backgroundColor: '#c9daf8',
			},
			{
				backgroundColor: '#c9daf8',
			},
			{
				backgroundColor: '#c9daf8',
			},
			{
				backgroundColor: '#c9daf8',
			},
			{
				backgroundColor: '#c9daf8',
			},
			{
				backgroundColor: '#c9daf8',
				rightBorderColor: '#000000',
			},
			...emptyObjRow7,
			{
				rightBorderColor: '#000000',
			},
		]);
		data.push([
			{},
			{ leftBorderColor: '#000000' },
			{},
			{},
			{},
			{},
			{},
			{
				rightBorderColor: '#000000',
			},
			...emptyObjRow5,
			{
				rightBorderColor: '#000000',
			},
		]);
		data.push([
			{},
			{ leftBorderColor: '#000000' },
			{},
			{},
			{},
			{},
			{},
			{
				rightBorderColor: '#000000',
			},
			...emptyObjRow5,
			{
				rightBorderColor: '#000000',
			},
		]);
		data.push([
			{},
			{ leftBorderColor: '#000000' },
			{},
			{},
			{},
			{},
			{},
			{
				rightBorderColor: '#000000',
			},
			...emptyObjRow5,
			{
				rightBorderColor: '#000000',
			},
		]);
		data.push([
			{},
			{ leftBorderColor: '#000000' },
			{},
			{},
			{},
			{},
			{},
			{
				rightBorderColor: '#000000',
			},
			...emptyObjRow5,
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
				rightBorderColor: '#000000',
				bottomBorderColor: '#000000',
			},
			...emptyObjRow8,
			{
				rightBorderColor: '#000000',
				bottomBorderColor: '#000000',
			},
		]);

		const columns = [
			{ width: 4 },
			{ width: 4 },
			{ width: 50 },
			{ width: 15 },
			{ width: 15 },
			{ width: 15 },
			{ width: 30 },
			{ width: 30 },
			...emptyObjRow6,
			{ width: 3 },
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
				const subjectEmail = `Jarvis : Export Financial Report Offline Store Revenue ${country_code}`;
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
