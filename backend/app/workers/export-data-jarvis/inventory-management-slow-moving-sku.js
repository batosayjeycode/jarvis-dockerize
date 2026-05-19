'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'inventory-management-slow-moving-sku' });
const workerHelpers = require('../../helpers/workerHelper');

class ExportInventoryManagementSlowMovingSku extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-inventory-management-slow-moving-sku');
	}
	getTotalCount() {
		return Q.try(() => {
			return this.options.client.connectDwh.query(this.options.queryCount);
		})
			.then((result) => {
				logger.info(`Total count: ${result.rows[0].count}`);
				return parseInt(result.rows[0].count);
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
						if (el[1] === 'user_conversion') {
							row[el[1]] = row[el[1]].toFixed(2);
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
	logger.info('Start jarvis inventory-management-slow-moving-sku');

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

	let fieldName = {
		REFERENCE: 'reference',
		'PRODUCT NAME': 'product_name',
		'PRODUCT ATTRIBUTE': 'product_attribute',
		BRAND: 'brand',
		STOCK: 'odoo_stock',
		'P30D Sold Qty': 'sold_p30d',
		'P3M Sold Qty': 'sold_p3m',
		'P6M Sold Qty': 'sold_p6m',
		DOI: 'doi',
		Store: 'store_name',
		INCOMING: 'incoming_stock',
	};

	if (document.data_display === 'B2B') {
		fieldName = {
			REFERENCE: 'reference',
			'PRODUCT NAME': 'product_name',
			'PRODUCT ATTRIBUTE': 'product_attribute',
			BRAND: 'brand',
			STOCK: 'odoo_stock',
			'P30D Sold Qty': 'sold_p30d',
			'P3M Sold Qty': 'sold_p3m',
			'P6M Sold Qty': 'sold_p6m',
			DOI: 'doi',
			'Sales Team': 'team_name',
		};
	}

	const outputFile = file_name;
	const fields = Object.keys(fieldName);
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportInventoryManagementSlowMovingSku({
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
			subject: 'Export Slow Moving SKU',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
