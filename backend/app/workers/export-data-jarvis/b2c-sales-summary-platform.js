'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'b2c-sales-summary-platform' });
const { Readable } = require('stream');
const workerHelpers = require('../../helpers/workerHelper');

class ExportB2CSalesSummaryPlatform extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-b2c-sales-summary-platform');
	}
	getTotalCount() {
		return Q.try(() => {
			if (this.options.document.isV2) {
				return Q.resolve({ rows: [{ total: this.options.document.total }] });
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
				const rows = result.rows || [];
				const objEnt = Object.entries(this.options.fields);
				for (const row of rows) {
					const obj = objEnt.reduce((accu, el, idx) => {
						accu[el[1]] = row[el[0]] || '';
						return accu;
					}, {});
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

const doGenerateFields = (document) => {
	let fields = {};

	if (document?.isV2) {
		if (document.view_point == 'brand') {
			fields = {
				brand_name: 'Brand',
			};
		} else if (document.view_point == 'default_category') {
			fields = {
				default_category: 'Category',
			};
		} else if (document.view_point == 'deepest_category') {
			fields = {
				parent: 'Parent',
				child: 'Child',
				category: 'Category',
			};
		} else if (document.view_point == 'order_platform') {
			fields = {
				order_platform: 'Order Platform',
			};
		} else {
			fields = {
				reference: 'Reference',
				product_name: 'Product Name',
				brand_name: 'Brand',
				default_category: 'Category',
			};
		}
	} else {
		if (document.view_point == 'by_brand') {
			fields = {
				brand: 'Brand',
			};
		} else if (document.view_point == 'by_default_category') {
			fields = {
				category_default: 'Category Default',
				category_default_isactive: 'Is Active',
			};
		} else if (document.view_point == 'by_deepest_category') {
			fields = {
				parent: 'Parent',
				child: 'Child',
				category: 'Category',
			};
		} else if (document.view_point == 'by_order_platform') {
			fields = {
				order_platform: 'Order Platform',
			};
		} else {
			fields = {
				id_product: 'Id Product',
				reference: 'Reference',
				product_name: 'Product Name',
				brand: 'Brand',
				category_default: 'Category',
				tree_categories: 'Tree Categories',
				product_classification: 'Classification',
				product_purchase_type: 'Product Purchase Type',
				url_sociolla: 'Product url',
			};
		}
	}

	fields.qty_gross = 'Qty (Gross)';
	fields.qty_valid = 'Qty (Valid)';
	fields.qty_net = 'Qty (Net)';
	fields.number_of_unique_order_gross = 'Number of Unique Order (Gross)';
	fields.number_of_unique_order_valid = 'Number of Unique Order (Valid)';
	fields.number_of_unique_order_net = 'Number of Unique Order (Net)';
	fields.value_gross = 'Value Gross';
	fields.value_valid = 'Value Valid';
	fields.value_net = 'Value Net';
	fields.voucher_prorate_gross = 'Voucher (Gross)';
	fields.voucher_prorate_valid = 'Voucher (Valid)';
	fields.voucher_prorate_net = 'Voucher (Net)';

	if (!['by_order_platform', 'order_platform'].includes(document.view_point)) {
		fields.order_platform = 'Order Platform';
	}
	return fields;
};

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
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis b2c-sales-summary-platform`);

	const outputFile = file_name;
	const type = document.view_point;
	const fields = doGenerateFields(document);
	const fieldHeader = Object.values(fields);
	const json2csv = new Transform({ fieldHeader }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportB2CSalesSummaryPlatform({
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
		fields,
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
			subject: `Export B2C ${isV2} Sales Summary By Platform`,
		});
		if (document?.isV2) {
			await client.connectNewDwh.query(`DROP TABLE ${document.tmp_table}`);
			logger.info(`${document.tmp_table} table deleted, by ${context?.user?.email} to ${criteria.send_to_email}`);
		}
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
