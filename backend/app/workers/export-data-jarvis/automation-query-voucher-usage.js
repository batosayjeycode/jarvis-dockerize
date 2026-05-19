'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-automation-query-voucher-usage-csv' });
const workerHelpers = require('../../helpers/workerHelper');

let fieldName = {};

const fieldNameDetail = {
	period: 'period',
	total_gross_voucher_order: 'total_gross_voucher_order',
	total_valid_voucher_order: 'total_valid_voucher_order',
	total_gross_voucher_order_customer: 'total_gross_voucher_order_customer',
	total_valid_voucher_order_customer: 'total_valid_voucher_order_customer',
	total_gross_voucher_order_value: 'total_gross_voucher_order_value',
	total_valid_voucher_order_value: 'total_valid_voucher_order_value',
	total_user_never_purchase_on_app: 'total_user_never_purchase_on_app',
	total_gross_voucher_order_qty: 'total_gross_voucher_order_qty',
	total_valid_voucher_order_qty: 'total_valid_voucher_order_qty',
	total_new_user: 'total_new_user',
	total_existing_user: 'total_existing_user',
};

const fieldNameTotalQty = {
	period: 'period',
	total_gross_voucher_order_qty: 'total_gross_voucher_order_qty',
	total_valid_voucher_order_qty: 'total_valid_voucher_order_qty',
};

const fieldNameCustomerBreakdown = {
	order_state: 'order_state',
	'Total Customer': 'Total Customer',
	'Customer ever shop in website': 'Customer ever shop in website',
	'Customer never shop in website': 'Customer never shop in website',
};

class AutomationQueryVoucherUsageCsv extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-automation-query-voucher-usage-csv');
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
	logger.info('Start jarvis export-automation-query-voucher-usage-csv');
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

	if (!document.file_type) {
		document.file_type = 'detail';
	}

	switch (document.file_type) {
		case 'detail':
			fieldName = fieldNameDetail;
			break;
		case 'total qty':
			fieldName = fieldNameTotalQty;
			break;
		case 'customer breakdown':
			fieldName = fieldNameCustomerBreakdown;
			break;
	}

	const outputFile = file_name;
	const fields = Object.keys(fieldName);
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new AutomationQueryVoucherUsageCsv({
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
			subject: 'Export Automation Query Voucher Usage',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
