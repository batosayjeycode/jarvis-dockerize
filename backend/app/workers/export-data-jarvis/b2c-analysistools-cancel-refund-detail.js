'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const moment = require('moment');
const logger = require('sociolla-core/lib/logger').getInstance({
	worker: 'export-b2c-analysistools-cancel-refund-detail',
});
const workerHelpers = require('../../helpers/workerHelper');

class ExportB2CAnalysistoolsCancelRefundDetail extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-b2c-analysistools-cancel-refund-detail');
	}
	getTotalCount() {
		return Q.try(() => {
			if (this.options.document.isV2) {
				return this.options?.document?.total;
			}
			return this.options.client.connectDwh.query(this.options.queryCount);
		}).then((result) => {
			if (this.options.document.isV2) {
				logger.info(
					`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Total count: ${result}`,
				);
				return result;
			}
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
			if (this.options.document.isV2) {
				const queryTmp = `SELECT * FROM ${this.options.document.tmp_table} LIMIT ${limit} OFFSET ${offset}`;
				return this.options.client.connectNewDwh.query(queryTmp);
			}
			const query = `${this.options.queryRow} LIMIT ${limit} OFFSET ${offset}`;
			return this.options.client.connectDwh.query(query);
		})
			.then((result) => {
				const rows = result.rows || [];
				for (const row of rows) {
					const data = Object.entries(this.options.fieldName).reduce((acc, el) => {
						if (el[1] === 'order_date') {
							row[el[1]] = row[el[1]]
								? moment(new Date(row[el[1]])).tz('Asia/Jakarta').format('DD/MM/YYYY HH:mm:ss')
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
	const file_name = message.data.file_name || null;
	const document = (criteria.document && JSON.parse(criteria.document)) || {};
	const isV2 = document?.isV2 ? 'V2' : '';
	logger.info(
		`[${context?.user?.name} - ${context?.user?.email}] Start jarvis ${isV2} b2c-analysistools-cancel-refund-detail`,
	);

	const fieldName = {
		'Order ID': 'id_order',
		Reference: 'reference',
		'Order Date': 'order_date',
		'Order State': 'order_state',
		Customer: 'customer',
		'ID Customer': 'id_customer',
		'Total Paid': 'total_order_paid',
	};

	if (document?.additional_field?.length) {
		document.additional_field.forEach((el) => {
			fieldName[el] = el;
		});
	}

	const outputFile = file_name;
	const fields = Object.keys(fieldName);
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);

	if (isV2) {
		// Create temp table for processing data
		const queryRow = `CREATE UNLOGGED TABLE IF NOT EXISTS ${document.tmp_table} AS (${criteria.queryRow})`;
		logger.info(
			`[${context?.user?.name} - ${context?.user?.email}] CREATING TABLE ${document.tmp_table} by ${context?.user?.email}`,
		);
		const data = await Promise.resolve(client.connectNewDwh.query(queryRow));
		document.total = data?.rowCount || 0;
		logger.info(`[${context?.user?.name} - ${context?.user?.email}] TABLE ${document.tmp_table} CREATED`);
	}

	const task = new ExportB2CAnalysistoolsCancelRefundDetail({
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
			subject: `Export B2C ${isV2} Analysis Tools Cancel Refund Detail`,
		});
		if (isV2) {
			// Drop temp table after processing
			await client.connectNewDwh.query(`DROP TABLE ${document.tmp_table}`);
			logger.info(`${document.tmp_table} table deleted, by ${context?.user?.email} to ${criteria.send_to_email}`);
		}
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
