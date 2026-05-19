'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-b2c-promotion-discount' });
const { Readable } = require('stream');
const workerHelpers = require('../../helpers/workerHelper');
const moment = require('moment');

class ExportB2CPromotionDiscount extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-b2c-promotion-discount');
	}
	getTotalCount() {
		return Q.try(() => {
			if (this.options.document?.isV2) {
				return Q.resolve({ rows: [{ total: this.options.document.total }] });
			}
			return this.options.clientConnection.query(this.options.queryCount);
		}).then((result) => {
			logger.info(
				`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Total count: ${result.rows[0].total}`,
			);
			return parseInt(result.rows[0].total);
		});
	}
	processBatch(limit, offset) {
		const self = this;
		const isV2 = this.options.document.isV2 || false;

		return Q.try(() => {
			logger.info(
				`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Start Query picked: ${limit}, processed: ${offset}`,
			);
			let query = '';
			if (isV2) {
				const order_by = this.options.document?.order_by ?? 'id_product_attribute';
				const order_by_type = this.options.document?.order_by_type ?? 'ASC';
				query = `SELECT * FROM ${this.options.document.tmp_table} ORDER BY ${order_by} ${order_by_type} LIMIT ${limit} OFFSET ${offset}`;
			} else {
				query = `${this.options.queryRow} LIMIT ${limit} OFFSET ${offset}`;
			}
			return this.options.clientConnection.query(query);
		})
			.then((result) => {
				const discounts = result.rows || [];
				for (const discount of discounts) {
					self.options.csv.push({
						'Id Product': discount.id_product,
						'Product Name': discount.product_name,
						Reference: discount.reference,
						Brand: discount.brand,
						Reduction: discount.reduction,
						...(isV2 ? { 'Base Price': discount.base_price } : {}),
						'Reduction Type': discount.reduction_type,
						'Valid From': isV2
							? ` ${moment(discount.valid_from).format('DD/MMM/YYYY HH:mm:ss')}` // Intentional space to avoid Excel date conversion
							: discount.valid_from,
						'Valid Until': isV2
							? ` ${moment(discount.valid_until).format('DD/MMM/YYYY HH:mm:ss')}` // Intentional space to avoid Excel date conversion
							: discount.valid_until,
						'Created at': discount.start_date,
						'Product Attribute': discount.product_attribute,
						'Id Product Attribute': discount.id_product_attribute,
					});
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
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis b2c-promotion-discount`);
	const clientConnection = document?.isV2 ? client.connectNewDwh : client.connectDwh;

	if (document?.isV2) {
		// Create Temporary Table for processing data
		const queryRow = `CREATE UNLOGGED TABLE IF NOT EXISTS ${document.tmp_table} AS (${criteria.queryRow})`;
		logger.info(
			`[${context?.user?.name} - ${context?.user?.email}] CREATING TABLE ${document.tmp_table} by ${context?.user?.email}}`,
		);
		const data = await Promise.resolve(clientConnection.query(queryRow));
		document.total = data?.rowCount || 0;
		logger.info(`[${context?.user?.name} - ${context?.user?.email}] TABLE ${document.tmp_table} CREATED`);
	}

	const outputFile = file_name;
	const fields = [
		'Id Product',
		'Product Name',
		'Reference',
		'Brand',
		'Reduction',
		...(document?.isV2 ? ['Base Price'] : []),
		'Reduction Type',
		'Valid From',
		'Valid Until',
		...(document?.isV2 ? [] : ['Created at']),
		'Product Attribute',
		'Id Product Attribute',
	];
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportB2CPromotionDiscount({
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
			subject: 'Export B2C Promotion Discount',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
