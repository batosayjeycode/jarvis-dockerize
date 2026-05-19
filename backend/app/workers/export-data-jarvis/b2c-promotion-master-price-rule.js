'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'b2c-promotion-master-price-rule' });
const { Readable } = require('stream');
const moment = require('moment');
const workerHelpers = require('../../helpers/workerHelper');

const fieldName = {
	'Price Rule': 'discount_name',
	'Type of Price Rule': 'type_of_price_rule',
	'Effective Date Start': 'effective_from',
	'Effective date End': 'affective_until',
	'Input by': 'input_by',
	'Input date & Time': 'input_datetime',
	Category: 'category',
	'Default Category': 'category_default',
	'Brand Name': 'brand',
	'SKU Type': 'sku_type',
	'Ref Code': 'sku',
	'Ref Code Child': 'child_sku',
	'SKU Name': 'sku_name',
	Combination: 'combination',
	'Base Price': 'base_price',
	'Cost Price': 'cost_price',
	'% to Base Price Exc. Tax': 'regular_gp',
	'Disc Type': 'discount_type',
	'Brand Support': 'brand_support',
	'Sociolla Support': 'sociolla_support',
	'Total Disc': 'total_discount',
	'Final Price': 'final_price',
	Discount: 'discount',
	'Amount Disc by Brand': 'amount_by_brand',
	'Amount Disc by Sociolla': 'amount_by_sociolla',
	// 'Promo GP': 'promo_gp',
	'% to Base Price Exc. Tax (after promo)': 'percentage_to_base_price',
	'Purchase Type': 'product_purchase_type',
};

class ExportB2CPromotionMasterPriceRule extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-b2c-promotion-master-price-rule');
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
			const query = `SELECT * FROM ${this.options.document.tmp_table} ORDER BY effective_from ASC LIMIT ${limit} OFFSET ${offset}`;
			return this.options.clientConnection.query(query);
		})
			.then((result) => {
				const rows = result.rows || [];
				const objEnt = Object.entries(fieldName);
				for (const row of rows) {
					const data = objEnt.reduce((acc, el) => {
						if (['effective_from', 'affective_until', 'input_datetime'].includes(el[1])) {
							acc[el[0]] = moment(new Date(row[el[1]])).format('YYYY-MM-DD HH:mm:ss') || null;
						} else if (
							['final_price', 'amount_by_sociolla', 'discount', 'amount_by_brand'].includes(el[1])
						) {
							acc[el[0]] = row[el[1]] ? parseInt(row[el[1]]).toFixed(2) : null;
						} else if (['regular_gp', 'percentage_to_base_price'].includes(el[1])) {
							acc[el[0]] = row[el[1]] ? parseFloat(row[el[1]]).toFixed(2) + '%' : null;
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
		`[${context?.user?.name} - ${context?.user?.email}] Start jarvis ${isV2} b2c-promotion-master-price-rule`,
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
	const fields = Object.keys(fieldName);
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportB2CPromotionMasterPriceRule({
		limit: 500,
		offset: 0,
		queryCount: criteria.queryCount,
		queryRow: criteria.queryRow,
		context,
		client,
		clientConnection,
		email: criteria.send_to_email,
		filename: criteria.filename,
		document,
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
			subject: 'Export B2C Master Price Rule Report',
		});

		await clientConnection.query(`DROP TABLE ${document.tmp_table}`);
		logger.info(`${document.tmp_table} table deleted, by ${context?.user?.email} to ${criteria.send_to_email}`);
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
