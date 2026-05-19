'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-b2c-operation-order-tracker' });
const workerHelpers = require('../../helpers/workerHelper');

const fieldInformation = {
	period: 'Date',
	order_in_sociolla: 'Order In Sociolla',
	order_in_lilla: 'Order In Lilla',
	order_in_edit_by_sociolla: 'Order In Edit By Sociolla',
	order_in_freebies: 'Order In Freebies',
	total_in: 'Total In',
	order_out_sociolla: 'Order Out Sociolla',
	order_out_lilla: 'Order Out Lilla',
	order_out_edit_by_sociolla: 'Order Out Edit By Sociolla',
	order_out_freebies: 'Order Out Freebies',
	total_out: 'Order Out',
};

class ExportB2COperationOrderTracker extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-b2c-operation-order-tracker');
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
				const objEnt = Object.entries(fieldInformation);
				for (const row of rows) {
					const newObj = objEnt.reduce((acc, el) => {
						if (el[0] == 'total_in') {
							row[el[0]] =
								parseInt(row.order_in_sociolla) +
								parseInt(row.order_in_lilla) +
								parseInt(row.order_in_edit_by_sociolla) +
								parseInt(row.order_in_freebies);
						} else if (el[0] == 'total_out') {
							row[el[0]] =
								parseInt(row.order_out_sociolla) +
								parseInt(row.order_out_lilla) +
								parseInt(row.order_out_edit_by_sociolla) +
								parseInt(row.order_out_freebies);
						}
						acc[el[1]] = row[el[0]] || '-';
						return acc;
					}, {});
					self.options.csv.push(newObj);
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
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis export-b2c-operation-order-tracker`);

	const outputFile = file_name;
	const fields = Object.values(fieldInformation);
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportB2COperationOrderTracker({
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
			subject: 'Export B2C Operation Order Tracker',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
