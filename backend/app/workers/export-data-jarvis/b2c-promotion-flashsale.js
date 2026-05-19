'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-b2c-promotion-flashsale' });
const { Readable } = require('stream');
const workerHelpers = require('../../helpers/workerHelper');
const orderMap = {
	product: 'total_order',
};

class ExportB2CPromotionFlashsale extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-b2c-promotion-flashsale');
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
			const orderby = orderMap[this?.options?.document?.report_type] || 'total_value';
			const query = `SELECT * FROM ${this.options.document.tmp_table} ORDER BY ${orderby} DESC LIMIT ${limit} OFFSET ${offset}`;
			return this.options.clientConnection.query(query);
		})
			.then((result) => {
				const rows = result.rows || [];
				for (const row of rows) {
					const data = Object.entries(this.options.fieldName).reduce((acc, el) => {
						if (el[1] === 'disc') {
							acc[el[0]] = parseFloat(row[el[1]]).toFixed(2) + '%';
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
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis ${isV2} b2c-promotion-flashsale`);

	let fieldName = {
		'ID Flash Sale': 'id_flashsale',
		'Flash Sale Name': 'flashsale_name',
		'Flash Sale Type': 'flashsale_type',
		Date: 'date',
		Time: 'time',
		'Total Order': 'total_order',
		'Qty Sold': 'total_qty_sold',
		'Total Sales': 'total_value',
	};

	if (document.report_type === 'platform') {
		fieldName = {
			Platform: 'order_platform',
			'FS Order': 'total_order',
			'% from All Order': 'percent_from_all',
			'Qty Sold': 'total_qty_sold',
			'Total Sales': 'total_value',
			AOV: 'aov',
		};
	} else if (document.report_type === 'store') {
		fieldName = {
			'Store Name': 'store_name',
			'FS Order': 'total_order',
			'% from All Order': 'percent_from_all',
			'Qty Sold': 'total_qty_sold',
			'Total Sales': 'total_value',
			AOV: 'aov',
		};
	} else if (document.report_type === 'product') {
		fieldName = {
			SKU: 'sku',
			'SKU Name': 'sku_name',
			Brand: 'brand',
			'FS Order': 'total_order',
			'Qty Sold': 'total_qty_sold',
			'Sales Before Disc': 'before_discount',
			'Sales After Disc': 'after_discount',
			'% Disc': 'disc',
		};
	}

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
	const task = new ExportB2CPromotionFlashsale({
		limit: 500,
		offset: 0,
		queryCount: criteria.queryCount,
		queryRow: criteria.queryRow,
		context,
		client,
		clientConnection,
		document,
		email: criteria.send_to_email,
		filename: criteria.filename,
		file_name,
		csv: input,
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
			subject: 'Export B2C Promotion Flashsale Summary',
		});

		await clientConnection.query(`DROP TABLE ${document.tmp_table}`);
		logger.info(`${document.tmp_table} table deleted, by ${context?.user?.email} to ${criteria.send_to_email}`);
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
