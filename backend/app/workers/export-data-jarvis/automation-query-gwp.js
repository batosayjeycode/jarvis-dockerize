'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-automation-query-gwp-csv' });
const workerHelpers = require('../../helpers/workerHelper');

const fieldName = {
	order_date_ori: 'order_date_ori',
	id_order: 'id_order',
	reference: 'reference',
	order_platform: 'order_platform',
	order_type: 'order_type',
	email: 'email',
	customer: 'customer',
	delivery_province: 'delivery_province',
	delivery_city: 'delivery_city',
	delivery_district: 'delivery_district',
	order_state: 'order_state',
	is_manual_order: 'is_manual_order',
	offlinestore_store_name: 'offlinestore_store_name',
	is_offlinestore_guest: 'is_offlinestore_guest',
	invoice_code: 'invoice_code',
	total_order_paid: 'total_order_paid',
	total_order_shipping: 'total_order_shipping',
	total_order_voucher: 'total_order_voucher',
	id_product: 'id_product',
	id_product_attribute: 'id_product_attribute',
	product_reference: 'product_reference',
	product_name: 'product_name',
	product_attribute: 'product_attribute',
	brand: 'brand',
	product_type: 'product_type',
	qty: 'qty',
	value: 'value',
	voucher_prorate: 'voucher_prorate',
};

class AutomationQueryGwpCsv extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-automation-query-gwp-csv');
	}
	getTotalCount() {
		return Q.try(() => {
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
			return this.options.client.connectDwh.query(query);
		})
			.then((result) => {
				const rows = result.rows || [];
				for (const row of rows) {
					const data = Object.entries(fieldName).reduce((acc, el) => {
						acc[el[0]] = row[el[1]] || null;
						return acc;
					}, {});
					self.options.csv.push(data);
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
	logger.info('Start jarvis export-automation-query-gwp-csv');
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
	const file_name = message.data.file_name || null;
	const document = (criteria.document && JSON.parse(criteria.document)) || {};

	const outputFile = file_name;
	const fields = Object.keys(fieldName);
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new AutomationQueryGwpCsv({
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
			subject: 'Export Automation Query GWP',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
