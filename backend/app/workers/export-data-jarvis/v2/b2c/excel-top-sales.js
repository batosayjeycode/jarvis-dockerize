'use strict';

const Q = require('q');

const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const writeXlsxFile = require('write-excel-file/node');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-v2-excel-b2c-top-sales' });
const CommonHelper = require('../../../../helpers/commonHelper');
const workerHelpers = require('../../../../helpers/workerHelper');
const percentKeys = ['percent', 'growth'];

class ExportExcelSalesOperationDashboardSummary extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-v2-excel-b2c-top-sales');
	}
	getTotalCount() {
		return Q.try(() => {
			logger.info(
				`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Total count: ${this?.options?.document?.total}`,
			);
			return this?.options?.document?.total;
		}).catch((err) => {
			logger.error(err);
			throw err;
		});
	}
	processBatch(limit, offset) {
		const self = this;
		return Q.try(() => {
			logger.info(
				`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Start Query picked: ${limit}, processed: ${offset}`,
			);
			const query = `${this.options.queryRow} LIMIT ${limit} OFFSET ${offset}`;
			return this.options.client.connectNewDwh.query(query);
		})
			.then((result) => {
				const rows = result?.rows || [];

				if (Object.keys(this.options.document.grand_total.length === 0)) {
					this.options.document.grand_total = rows.reduce((_, item) => {
						// Reduce the object into sub_total and grand_total properties
						const grand_total = Object.keys(item)
							.filter((key) => key.startsWith('grandtotal_'))
							.reduce((grandAcc, key) => {
								grandAcc[key.replace('grandtotal_', '')] = item[key];
								return grandAcc;
							}, {});

						return grand_total;
					}, {});
				}

				for (const row of rows) {
					const data = Object.entries(this.options.fieldName).map(([_, val]) => {
						const isString = [
							'brand_name',
							'brand_type',
							'default_category',
							'brand',
							'product_variant',
						].includes(val);
						const isPercentField = percentKeys.some((p) => val.includes(p));
						let value =
							val === 'product_variant'
								? `${row['reference']} | ${row['ean_no']}\r\n${row['product_name']} ${row['product_attribute']}`
								: row[val];

						if (isPercentField) {
							value /= 100;
						} else if (!isString && value) {
							value = CommonHelper.formatNumber(value, 0);
						}

						const obj = {
							value,
							borderColor: '#000000',
							type: isString ? String : Number,
							format: isString ? '' : isPercentField ? '0.00%' : '#,##0',
						};

						if (val === 'product_variant') {
							obj['wrap'] = true;
						}

						return obj;
					});
					self.options.data.push(data);
				}
			})
			.then(() => {
				logger.info(
					`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Done ${
						limit + offset
					}`,
				);
			})
			.catch((err) => {
				logger.error(err);
				throw err;
			});
	}
}

module.exports = async (message) => {
	const criteria = message.data.criteria;
	const context = message.data.context;
	const isValidEmail = workerHelpers.checkValidEmail(criteria.send_to_email);
	if (!isValidEmail) {
		logger.error(
			`[${context?.user?.name} - ${context?.user?.email}] Email to '${criteria.send_to_email}' is not valid!`,
		);
		return;
	}
	const client = message.client;
	const document = (criteria.document && JSON.parse(criteria.document)) || {};
	const clientJarvis = message.clientJarvis;
	const file_name = message.data.file_name || null;
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis v2-excel-b2c-top-sales`);

	const generateEmptyObj = (len = 1, obj = {}) => {
		const res = [];
		for (let i = 0; i < len; i++) {
			res.push(obj);
		}
		return res;
	};

	const outputFile = file_name;
	const field =
		document?.group_by === 'brand'
			? { BRAND: 'brand_name', 'BRAND TYPE': 'brand_type' }
			: document?.group_by === 'category'
				? { 'Default Product Category': 'default_category' }
				: { 'Product Variant': 'product_variant', BRAND: 'brand' };

	const fieldName = {
		...field,
		'Qty Amount (MP)': 'qty',
		'Qty Cont. % (MP)': 'qty_percent',
		'Qty Amount (CP)': 'qty_cp',
		'Qty Cont. % (CP)': 'qty_percent_cp',
		'Qty Growth (%)': 'qty_growth',

		'NMV Amount (MP)': 'nmv',
		'NMV Cont. % (MP)': 'nmv_percent',
		'NMV Amount (CP)': 'nmv_cp',
		'NMV Cont. % (CP)': 'nmv_percent_cp',
		'NMV Growth (%)': 'nmv_growth',

		'Net Revenue Amount (MP)': 'net_revenue',
		'Net Revenue Cont. % (MP)': 'net_revenue_percent',
		'Net Revenue Amount (CP)': 'net_revenue_cp',
		'Net Revenue Cont. % (CP)': 'net_revenue_percent_cp',
		'Net Revenue Growth (%)': 'net_revenue_growth',
	};

	const TITLE = [
		[
			{
				value: 'Top Sales',
				fontWeight: 'bold',
				align: 'left',
			},
		],
		[
			{
				value: 'Start Date',
				fontWeight: 'bold',
				align: 'left',
			},
			{
				value: new Date(document?.start_date),
				fontWeight: 'bold',
				align: 'left',
				type: Date,
				format: 'dd/mmm/yyyy',
			},
		],
		[
			{
				value: 'End Date',
				fontWeight: 'bold',
				align: 'left',
			},
			{
				value: new Date(document?.end_date),
				fontWeight: 'bold',
				align: 'left',
				type: Date,
				format: 'dd/mmm/yyyy',
			},
		],
		[
			{
				value: 'Filter',
				fontWeight: 'bold',
				align: 'left',
			},
			{
				value: document?.export_label_filter_option,
				fontWeight: 'bold',
				align: 'left',
			},
		],
		[
			{
				value: 'Jarvis Link',
				fontWeight: 'bold',
				align: 'left',
			},
			{
				value: document?.export_label_link_option,
				fontWeight: 'bold',
				align: 'left',
			},
		],
	];

	const HEADER_ROW = Object.entries(fieldName).map(([f]) => {
		return {
			value: f,
			fontWeight: 'bold',
			borderColor: '#000000',
			backgroundColor: '#c5deb5',
			align: 'left',
		};
	});

	const data = [...TITLE, [], [], HEADER_ROW];
	const columns = generateEmptyObj(Object.keys(fieldName).length - 1, { width: 20 });
	if (document?.group_by === 'product') {
		columns.unshift({ width: 50 });
	} else {
		columns.unshift({ width: 20 });
	}
	document['grand_total'] = {};

	const task = new ExportExcelSalesOperationDashboardSummary({
		limit: 500,
		offset: 0,
		queryCount: criteria.queryCount,
		queryRow: criteria.queryRow,
		additionQuery: criteria.additionQuery,
		document,
		context,
		client,
		email: criteria.send_to_email,
		filename: criteria.filename,
		file_name,
		data,
		stopOnError: true,
		rejectOnError: true,
		fieldName,
	});

	try {
		await task.execute();

		document.grand_total['brand_name'] = 'Total';
		document.grand_total['default_category'] = 'Total';
		document.grand_total['product_variant'] = 'Total';
		const grand_total_excel = Object.entries(fieldName).map(([_, val]) => {
			const isString = ['brand_name', 'brand_type', 'default_category', 'brand', 'product_variant'].includes(val);
			const isPercentField = percentKeys.some((p) => val.includes(p));

			let value = document?.grand_total[val];
			if (isPercentField) {
				value /= 100;
			} else if (!isString && value) {
				value = CommonHelper.formatNumber(value, 0);
			}

			const obj = {
				value,
				borderColor: '#000000',
				borderStyle: 'double',
				fontWeight: 'bold',
				type: isString ? String : Number,
				format: isString ? '' : isPercentField ? '0.00%' : '#,##0',
			};

			return obj;
		});
		data.push(grand_total_excel);

		await writeXlsxFile(data, {
			columns,
			filePath: outputFile,
			sheet: 'Top Sales',
		});
		await workerHelpers.sendmail({
			logger,
			context,
			outputFile,
			fs,
			clientJarvis,
			criteria,
			subject: 'Jarvis : Export Top Sales',
			is_export_excel: true,
		});
		await client.connectNewDwh.query(`DROP TABLE ${document.tmp_table}`);
		logger.info(`${document.tmp_table} table deleted, by ${context?.user?.email} to ${criteria.send_to_email}`);
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
