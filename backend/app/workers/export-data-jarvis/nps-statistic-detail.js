'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const moment = require('moment');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-nps-statistic-detail-csv' });
const workerHelpers = require('../../helpers/workerHelper');

class NpsStatisticDetailCsv extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-nps-statistic-detail-csv');
	}
	getTotalCount() {
		return Q.try(() => {
			logger.info(
				`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Total count: ${this?.options?.document?.total_data}`,
			);
			return this?.options?.document?.total_data;
		}).catch((err) => {
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
			return this.options.clientConnection.query(query);
		})
			.then((result) => {
				const rows = result.rows || [];
				for (const row of rows) {
					const data = Object.entries(this.options.fieldName).reduce((acc, el) => {
						if (el[1] === 'datetime') {
							acc[el[0]] = moment(new Date(row[el[1]])).format('YYYY-MM-DD HH:mm:ss') || null;
						} else {
							acc[el[0]] = row[el[1]] || null;
						}
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
	const isV2 = document?.isV2 ? 'V2' : '';
	const clientConnection = document?.isV2 ? client.connectNewDwh : client.connectDwh;
	logger.info(
		`[${context?.user?.name} - ${context?.user?.email}] Start jarvis ${isV2} export-nps-statistic-detail-csv`,
	);

	const fieldName = {
		'Date & Time': 'datetime',
		'Order Reference': 'order_reference',
		'Satisfaction Rate': 'rating',
		Store: 'store',
		'Cashier ID': 'cashier_id',
		'Cashier Name': 'cashier_name',
		'Customer Unique ID': 'customer_unique_id',
	};

	// Create Temporary Table for processing data
	const queryRow = `CREATE UNLOGGED TABLE IF NOT EXISTS ${document.tmp_table} AS (${criteria.queryRow})`;
	logger.info(
		`[${context?.user?.name} - ${context?.user?.email}] CREATING TABLE ${document.tmp_table} by ${context?.user?.email}}`,
	);
	const data = await Promise.resolve(clientConnection.query(queryRow));
	document.total_data = data?.rowCount || 0;
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] TABLE ${document.tmp_table} CREATED`);

	const outputFile = file_name;
	const fields = Object.keys(fieldName);
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new NpsStatisticDetailCsv({
		limit: 500,
		offset: 0,
		queryCount: criteria.queryCount,
		queryRow: criteria.queryRow,
		context,
		client,
		clientConnection,
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
			subject: 'Export NPS Statistic Detail',
		});

		await clientConnection.query(`DROP TABLE ${document.tmp_table}`);
		logger.info(`${document.tmp_table} table deleted, by ${context?.user?.email} to ${criteria.send_to_email}`);
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
