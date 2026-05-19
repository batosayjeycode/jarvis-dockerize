'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const moment = require('moment');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-b2c-sales-giftcard' });
const workerHelpers = require('../../helpers/workerHelper');

class ExportB2CSalesGiftcard extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-b2c-sales-giftcard');
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
			if (this.options.document.isV2) {
				const query = `WITH limited_orders AS (${this.options?.document?.all_query['queryWithLimitedOrders']} ${this.options?.document?.order_by_query} LIMIT ${limit} OFFSET ${offset}) ${this.options?.document?.all_query['queryMain']}`;
				return this.options.client.connectNewDwh.query(query);
			} else {
				const query = `${this.options.queryRow} LIMIT ${limit} OFFSET ${offset}`;
				return this.options.client.connectDwh.query(query);
			}
		})
			.then((result) => {
				const rows = result.rows || [];
				for (const row of rows) {
					const data = Object.entries(this.options.fieldName).reduce((acc, el) => {
						if (['order_date_ori', 'delivery_date'].includes(el[1])) {
							row[el[1]] = row[el[1]]
								? moment(new Date(row[el[1]])).tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm:ss')
								: '';
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
	const clientJarvis = message.clientJarvis;
	const document = (criteria.document && JSON.parse(criteria.document)) || {};
	const file_name = message.data.file_name || null;
	const isV2 = document?.isV2 ? 'V2' : '';
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis ${isV2} b2c-sales-giftcard`);

	const outputFile = file_name;
	const fieldName = {
		'Order Date': 'order_date_ori',
		'Order ID': 'id_order',
		Reference: 'reference',
		Payment: 'order_payment',
		Email: 'email',
		Province: 'delivery_province',
		'Total Paid': 'total_order_paid',
		Status: 'order_state',
		'Sender Name': 'sender_name',
		'Delivery Date': 'delivery_date',
		'Product Reference': 'product_reference',
		'Product Name': 'product_name',
		Qty: 'qty',
		'Is Custom': 'is_custom',
	};

	const fields = Object.keys(fieldName);
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportB2CSalesGiftcard({
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
		fieldName,
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
			subject: `Export B2C ${isV2} Sales Gift Card`,
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
