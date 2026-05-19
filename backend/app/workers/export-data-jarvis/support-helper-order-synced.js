'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const moment = require('moment');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-support-helper-order-synced' });
const workerHelpers = require('../../helpers/workerHelper');

class SupportHelperOrderSynced extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-support-helper-order-synced');
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
					const data = Object.entries(this.options.fieldName).reduce((acc, el) => {
						if (
							[
								'order_date',
								'shipped_date',
								'order_date_odoo_sri',
								'synced_date_sri',
								'order_date_sbi',
								'synced_date_sbi',
							].includes(el[1])
						) {
							row[el[1]] = row[el[1]] ? moment(new Date(row[el[1]])).format('YYYY-MM-DD HH:mm') : null;
						}
						acc[el[0]] = row[el[1]] || '';
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
	const file_name = message.data.file_name || null;
	const document = (criteria.document && JSON.parse(criteria.document)) || {};
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis export-support-helper-order-synced`);

	const fieldName = {
		'Order Date': 'order_date',
		'Order ID': 'id_order',
		'Order Mongo ID': 'id_order_mongo',
		Reference: 'reference',
		'Shipped Date': 'shipped_date',
		'Current State': 'order_state',
		[`Order ID ${context?.user?.country === 'vn' ? 'SRV' : 'SRI'} - ODOO`]: 'id_order_odoo_sri',
		[`Order Date ${context?.user?.country === 'vn' ? 'SRV' : 'SRI'}`]: 'order_date_odoo_sri',
		[`Synced Date ${context?.user?.country === 'vn' ? 'SRV' : 'SRI'}`]: 'synced_date_sri',
		[`Order ID ${context?.user?.country === 'vn' ? 'SBV' : 'SBI'} - ODOO`]: 'id_order_odoo_sbi',
		[`Order Date ${context?.user?.country === 'vn' ? 'SBV' : 'SBI'}`]: 'order_date_sbi',
		[`Synced Date ${context?.user?.country === 'vn' ? 'SBV' : 'SBI'}`]: 'synced_date_sbi',
		Store: 'store_name',
		'Sync Status': 'sync_status',
	};

	const outputFile = file_name;
	const fields = Object.keys(fieldName);
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new SupportHelperOrderSynced({
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
		fieldName,
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
			subject: 'Export Item Order Synced',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
