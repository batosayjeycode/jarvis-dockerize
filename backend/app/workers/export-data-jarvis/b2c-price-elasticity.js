'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const moment = require('moment-timezone');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'b2c-promotion-price-elasticity' });
const workerHelpers = require('../../helpers/workerHelper');

class ExportB2CPriceElasticitySummary extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-b2c-price-elasticity');
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
			const query = `SELECT * FROM ${this.options.document.tmp_table} ORDER BY id_product ASC LIMIT ${limit} OFFSET ${offset}`;
			return this.options.clientConnection.query(query);
		})
			.then((result) => {
				const rows = result.rows || [];
				const objEnt = Object.entries(this.options.fieldName);
				for (const row of rows) {
					const data = objEnt.reduce((acc, el) => {
						if (el[1] === 'period') {
							row[el[1]] = row[el[1]]
								? moment(row[el[1]]).tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm:ss')
								: '';
						}
						acc[el[0]] = row[el[1]] || (el[1].includes('price_elasticity') ? 0 : null);
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
		`[${context?.user?.name} - ${context?.user?.email}] Start jarvis ${isV2} b2c-promotion-price-elasticity`,
	);

	// Create Temporary Table for processing data
	const queryRow = `CREATE UNLOGGED TABLE IF NOT EXISTS ${document.tmp_table} AS (${criteria.queryRow})`;
	logger.info(
		`[${context?.user?.name} - ${context?.user?.email}] CREATING TABLE ${document.tmp_table} by ${context?.user?.email}}`,
	);
	const data = await Promise.resolve(clientConnection.query(queryRow));
	document.total_data = data?.rowCount || 0;
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] TABLE ${document.tmp_table} CREATED`);

	const outputFile = file_name;
	const fieldName = {
		id_product: 'id_product',
		reference: 'reference',
		product_name: 'product_name',
		product_attribute: 'product_attribute',
		brand: 'brand',
		category_default: 'category_default',
		base_price: 'base_price',
		period: 'period',
		avg_final_price: 'avg_final_price',
		avg_discount: 'avg_discount',
		[`sold_qty_${document.value_mode_elasticity}`]: `sold_qty_${document.value_mode_elasticity}`,
		discount_names: 'discount_names',
		[`price_elasticity_${document.value_mode_elasticity}`]: `price_elasticity_${document.value_mode_elasticity}`,
	};

	const fields = Object.keys(fieldName);
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportB2CPriceElasticitySummary({
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
			subject: 'Export B2C Price Elasticity Report',
		});

		await clientConnection.query(`DROP TABLE ${document.tmp_table}`);
		logger.info(`${document.tmp_table} table deleted, by ${context?.user?.email} to ${criteria.send_to_email}`);
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
