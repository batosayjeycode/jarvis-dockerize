'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const moment = require('moment');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-offline-order-price-logs' });
const workerHelpers = require('../../helpers/workerHelper');
const fieldName = {
	_id: '_id',
	order_reference: 'order_reference',
	order_from: 'order_from',
	cashier_name: 'cashier_name',
	cashier_email: 'cashier_email',
	is_edited_by_cashier: 'is_edited_by_cashier',
	order_date: 'order_date',
	product_id: 'product_id',
	brand: 'brand',
	product_name: 'product_name',
	ean_no: 'ean_no',
	product_reference: 'product_reference',
	supposed_price: 'supposed_price',
	changed_price: 'changed_price',
	new_discount: 'new_discount',
	product_qty: 'product_qty',
	edit_reason: 'edit_reason',
	reason: 'reason',
	admin_email: 'admin_email',
};

class OfflineOrderPriceLogs extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-offline-order-price-logs');
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
					const data = Object.entries(fieldName).reduce((acc, el) => {
						if (['order_date'].includes(el[1])) {
							row[el[1]] = row[el[1]] ? moment(new Date(row[el[1]])).format('YYYY-MM-DD HH:mm:ss') : null;
						}
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
	const file_name = message.data.file_name || null;
	const document = (criteria.document && JSON.parse(criteria.document)) || {};
	const clientJarvis = message.clientJarvis;
	logger.info(
		`[${context?.user?.name} - ${context?.user?.email}] Start jarvis All Sociolla - Export Report - offline-order-price-logs`,
	);

	const outputFile = file_name;
	const fields = Object.keys(fieldName);
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new OfflineOrderPriceLogs({
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
			subject: 'Export Offline Order Price Logs',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
