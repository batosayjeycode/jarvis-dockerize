'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-all-sociolla-sales-summary' });
const workerHelpers = require('../../helpers/workerHelper');

class ExportAllSociollaSalesSummary extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-all-sociolla-sales-summary');
	}
	getTotalCount() {
		return Q.try(() => {
			return this.options.client.connectDwh.query(this.options.queryCount);
		}).then((result) => {
			logger.info(
				`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Total count: ${result.rows[0].total}`,
			);
			return parseInt(result.rows[0].total);
		});
	}
	processBatch(limit, offset) {
		const self = this;
		return Q.try(() => {
			logger.info(
				`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Start Query picked: ${limit}, processed: ${offset}`,
			);
			const query = `${this.options.queryRow} LIMIT ${limit} OFFSET ${offset}`;
			return this.options.client.connectDwh.query(query);
		})
			.then((result) => {
				const rows = result.rows || [];
				for (const row of rows) {
					self.options.csv.push({
						'Id Product': row.id,
						Reference: row.reference,
						'Product Name': row.product_name,
						Brand: row.brand,
						'Order Platform': row.order_platform,
						Parent: row.parent,
						Child: row.child,
						Category: row.category_default || row.category,
						'Category Default': row.category_default,
						'Tree Category': row.tree_categories,
						Classification: row.product_classification,
						'Qty (Gross)': row.total_qty_gross,
						'Qty (Valid)': row.total_qty_valid,
						'Qty (Net)': row.total_qty_net,
						'Value Gross': row.total_value_gross,
						'Value Valid': row.total_value_valid,
						'Value Net': row.total_value_net,
						'Product Purchase Type': row.product_purchase_type,
					});
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
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis all-sociolla-sales-summary`);

	const outputFile = file_name;
	const type = document.view_point;
	let fields = [];
	if (type === 'by_brand') {
		fields = ['Brand'];
	} else if (type === 'by_default_category') {
		fields = ['Category Default'];
	} else if (type === 'by_deepest_category') {
		fields = ['Parent', 'Child', 'Category'];
	} else if (type === 'by_order_platform') {
		fields = ['Order Platform'];
	} else {
		fields = [
			'Id Product',
			'Reference',
			'Product Name',
			'Brand',
			'Category',
			'Tree Category',
			'Classification',
			'Product Purchase Type',
		];
	}
	fields.push('Qty (Gross)');
	fields.push('Qty (Valid)');
	fields.push('Qty (Net)');
	fields.push('Value Gross');
	fields.push('Value Valid');
	fields.push('Value Net');

	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportAllSociollaSalesSummary({
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
			subject: 'Export B2C Sales Summary',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
