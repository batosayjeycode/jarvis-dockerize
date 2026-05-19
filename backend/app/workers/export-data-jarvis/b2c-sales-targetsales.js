'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-b2c-sales-targetsales' });
const workerHelpers = require('../../helpers/workerHelper');

class ExportB2CSalesTargetSales extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-b2c-sales-targetsales');
	}
	getTotalCount() {
		return Q.try(() => {
			if (this.options.document.isV2) {
				return this.options.client.connectNewDwh.query(this.options.queryCount);
			}
			return this.options.client.connectDwh.query(this.options.queryCount);
		})
			.then((result) => {
				logger.info(
					`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Total count: ${result.rows[0].total}`,
				);
				return parseInt(result.rows[0].total);
			})
			.catch((err) => {
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
			if (this.options.document.isV2) {
				return this.options.client.connectNewDwh.query(query);
			}
			return this.options.client.connectDwh.query(query);
		})
			.then((result) => {
				const type = this.options.type;
				const rows = result.rows || [];
				for (const row of rows) {
					const obj = {};
					if (type === 'brand') {
						obj['Id Brand'] = row.id_brand || row.brand_id;
						obj['Brand'] = row.brand || row.brand_name;
					} else if (type === 'platform') {
						obj['Order Platform'] = row.order_platform || row.order_source;
					} else if (type === 'store') {
						obj['Store Name'] = row.store_name || row.store;
					} else {
						obj['Id Product'] = row.id_product;
						obj['Id Product Attribute'] = row.id_product_attribute;
						obj['Reference'] = row.reference;
						obj['ean13'] = row.ean13;
						obj['Product Name'] = row.product_name;
						obj['Product Attribute'] = row.product_attribute;
						obj['Brand'] = row.brand;
					}
					obj['Target Sales'] = row.target_sales;
					obj['Total COGS'] = row.total_cogs;
					obj['Total Retail Value'] = row.total_retail_value;
					obj['Actual Sales'] = row.actual_sales;
					obj['Diff Stock'] = row.diff_stock;
					obj['Diff Sales'] = row.diff_sales;
					obj['Net Revenue Target'] = row.net_revenue_target;
					obj['Net Revenue'] = row.net_revenue;
					obj['Achievement (%)'] = row.achiev_percentage;
					obj['Net Revenue Ach. (%)'] = row.net_revenue_ach_percentage;

					if (this.options.document.is_compare && this.options.document.is_compare === '1') {
						(this.options.document.compare_period_list || []).forEach((list) => {
							obj['Target Sales ' + list.value] = row[`target_sales_${list.key}`];
							obj['Actual Sales ' + list.value] = row[`actual_sales_${list.key}`];
							obj['Total Retail Value ' + list.value] = row[`retail_value_${list.key}`];
							obj['Diff Stock ' + list.value] = row[`diff_stock_${list.key}`];
							obj['Diff Sales ' + list.value] = row[`diff_sales_${list.key}`];
							obj['Achievement' + list.value + ' (%)'] = row[`achiev_percentage_${list.key}`];
							obj['Net Revenue Ach.' + list.value + ' (%)'] =
								row[`net_revenue_ach_percentage_${list.key}`];
						});
					}

					self.options.csv.push(obj);
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
	const clientJarvis = message.clientJarvis;
	const document = (criteria.document && JSON.parse(criteria.document)) || {};
	const file_name = message.data.file_name || null;
	const isV2 = document?.isV2 ? 'V2' : '';
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis ${isV2} b2c-sales-targetsales`);

	const outputFile = file_name;
	let type = file_name.split('_');
	type = type[1];
	if (document?.isV2) {
		type = document.view_point === 'order_platform' ? 'platform' : document.view_point;
	}
	let fields = [];
	const commonFields = [
		'Total COGS',
		'Total Retail Value',
		'Target Sales',
		'Actual Sales',
		'Diff Stock',
		'Diff Sales',
		'Achievement (%)',
	];
	const commonFieldsV2 = [
		'Total Retail Value',
		'Target Sales',
		'Actual Sales',
		'Diff Stock',
		'Diff Sales',
		'Net Revenue Target',
		'Net Revenue',
		'Net Revenue Ach. (%)',
	];
	const baseFields = {
		brand: ['Id Brand', 'Brand'],
		platform: ['Order Platform'],
		store: ['Store Name'],
		default: [
			'Id Product',
			'Id Product Attribute',
			'Reference',
			'ean13',
			'Product Name',
			'Product Attribute',
			'Brand',
		],
	};

	const getFields = (type, isV2) => {
		const base = baseFields[type] || baseFields.default;
		return isV2 ? [...base, ...commonFieldsV2] : [...base, ...commonFields];
	};
	fields = getFields(type, document?.isV2);

	if (document.is_compare && document.is_compare === '1') {
		(document.compare_period_list || []).forEach((period) => {
			fields.push(`Target Sales ${period.value}`);
			fields.push(`Actual Sales ${period.value}`);
			fields.push(`Total Retail Value ${period.value}`);
			fields.push(`Diff Stock ${period.value}`);
			fields.push(`Diff Sales ${period.value}`);
			fields.push(`Achievement ${period.value} (%)`);
		});
	}

	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportB2CSalesTargetSales({
		limit: 500,
		offset: 0,
		queryCount: criteria.queryCount,
		queryRow: criteria.queryRow,
		context,
		client,
		email: criteria.send_to_email,
		filename: criteria.filename,
		file_name,
		csv: input,
		type,
		document,
		stopOnError: true,
		rejectOnError: true,
	});

	try {
		await task.execute();
		await workerHelpers.sendmail({
			input,
			output,
			logger,
			context,
			outputFile,
			fs,
			clientJarvis,
			criteria,
			subject: `Export B2C ${isV2} Sales Target Sales`,
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
