'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-v2-giftcard-details' });
const CommonHelper = require('../../../../helpers/commonHelper');
const workerHelpers = require('../../../../helpers/workerHelper');

class ExportGiftCardDetails extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-v2-giftcard-details');
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
				const rows = result?.rows || [];

				for (const row of rows) {
					const data = Object.entries(this.options.fieldName).reduce((acc, [fieldKey, fieldName]) => {
						const value = row[fieldName];

						if (fieldName === 'order_date') {
							// Format the date if it exists, otherwise set to an empty string
							row[fieldName] = value ? CommonHelper.formatDate(value) : '';
						} else if (['total_sales', 'total_voucher_prorate'].includes(fieldName)) {
							// Format number fields
							row[fieldName] = value ? CommonHelper.formatNumber(value) : '';
						}

						// Assign the formatted or original value (or null if missing) to the accumulator
						acc[fieldKey] = row[fieldName] || null;
						return acc;
					}, {});

					this.options.csv.push(data);
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
		'Egift Code': 'code',
		'Order ID': 'id_order',
		Reference: 'reference',
		'Order Date': 'order_date',
		'Order State': 'order_state',
		Email: 'email',
		'Customer Province': 'customer_province',
		Qty: 'total_quantity',
		Sales: 'total_sales',
		'Voucher Prorate': 'total_voucher_prorate',
	};

	const fields = Object.keys(fieldName);
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportGiftCardDetails({
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
