'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-b2c-promotion-pwp' });
const { Readable } = require('stream');
const workerHelpers = require('../../helpers/workerHelper');

class ExportB2CPromotionPwp extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-b2c-promotion-pwp');
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
			const query = `SELECT * FROM ${this.options.document.tmp_table} ORDER BY qty_sold DESC LIMIT ${limit} OFFSET ${offset}`;
			return this.options.clientConnection.query(query);
		})
			.then((result) => {
				const rows = result.rows || [];
				for (const row of rows) {
					const data = Object.entries(this.options.fieldName).reduce((acc, el) => {
						if (el[1] === 'disc') {
							acc[el[0]] = row[el[1]] ? parseFloat(row[el[1]]).toFixed(2) + '%' : '';
						} else if (el[1] === 'atu') {
							acc[el[0]] = (parseInt(row.qty_sold) / parseInt(row.total_order)).toFixed(2);
						} else if (el[1] === 'aov_total_paid') {
							acc[el[0]] = Math.round(parseInt(row.aov) / parseInt(row.total_order));
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
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis ${isV2} b2c-promotion-pwp`);

	const fieldNameMap = {
		default: {
			'ID PWP': 'pwp_id',
			'PWP Name': 'pwp_name',
			Date: 'date',
			'Total Order': 'total_order',
			'Qty Sold': 'qty_sold',
			'Total Sales': 'total_sales',
		},
		platform: {
			Platform: 'order_platform',
			'PWP Order': 'total_order',
			'% from All Order': 'percent_from_all',
			'Qty Sold': 'qty_sold',
			'Total Sales': 'total_sales',
			AOV: 'aov',
		},
		store: {
			'Store Name': 'store_name',
			'PWP Order': 'total_order',
			'% from All Order': 'percent_from_all',
			'Qty Sold': 'qty_sold',
			'Total Sales': 'total_sales',
			AOV: 'aov',
			ATU: 'atu',
			'AOV Total Paid': 'aov_total_paid',
		},
		product: {
			SKU: 'sku',
			'SKU Name': 'sku_name',
			Brand: 'brand',
			'PWP Order': 'total_order',
			'Qty Sold': 'qty_sold',
			'Total Sales': 'total_sales',
		},
	};

	const fieldName = fieldNameMap[document?.report_type] || fieldNameMap.default;

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
	const task = new ExportB2CPromotionPwp({
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
			subject: 'Export B2C Promotion PWP Report',
		});

		await clientConnection.query(`DROP TABLE ${document.tmp_table}`);
		logger.info(`${document.tmp_table} table deleted, by ${context?.user?.email} to ${criteria.send_to_email}`);
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
