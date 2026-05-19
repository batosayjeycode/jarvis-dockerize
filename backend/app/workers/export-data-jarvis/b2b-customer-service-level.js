/**
 * @author Dikdik Kusdinar
 **/
'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-b2b-customer-service-level' });
const workerHelpers = require('../../helpers/workerHelper');

class ExportB2BCustomerServiceLevel extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-b2b-customer-service-level');
	}
	getTotalCount() {
		return Q.try(() => {
			return this.options.client.connectDwh.query(this.options.queryCount);
		}).then((result) => {
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
			const query = `${this.options.queryRow} LIMIT ${limit} OFFSET ${offset}`;
			return this.options.client.connectDwh.query(query);
		})
			.then((result) => {
				const rows = result.rows || [];
				for (const row of rows) {
					const obj = {};
					if (this.options.type === 'by_product') {
						obj['Customer ID'] = row.id_customer;
						obj['Customer Name'] = row.customer_name;
						obj['Brand ID'] = row.manufacturer_id;
						obj['Brand'] = row.manufacturer;
						obj['Product ID'] = row.id_product;
						obj['Product Ref'] = row.product_ref;
						obj['Product UOM QTY'] = row.product_uom_qty;
						obj['Delivered QTY'] = row.qty_delivered;
						obj['Delivered Value'] = row.val_delivered;
						obj['Service level'] = row.service_level;
						obj['Service Level value'] = row.service_level_val;
					} else if (this.options.type === 'by_brand') {
						obj['Customer ID'] = row.id_customer;
						obj['Customer Name'] = row.customer_name;
						obj['Brand ID'] = row.manufacturer_id;
						obj['Brand'] = row.manufacturer;
						obj['Product UOM QTY'] = row.product_uom_qty;
						obj['Delivered QTY'] = row.qty_delivered;
						obj['Delivered Value'] = row.val_delivered;
						obj['Service level'] = row.service_level;
						obj['Service Level value'] = row.service_level_val;
					} else {
						obj['Customer ID'] = row.id_customer;
						obj['Customer Name'] = row.customer_name;
						obj['Product UOM QTY'] = row.product_uom_qty;
						obj['Delivered QTY'] = row.qty_delivered;
						obj['Delivered Value'] = row.val_delivered;
						obj['Service level'] = row.service_level;
						obj['Service Level value'] = row.service_level_val;
					}

					self.options.csv.push(obj);
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
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis b2b-customer-service-level`);

	const outputFile = file_name;
	let fields = [];
	const type = document.view_point || 'by_general';

	if (type === 'by_product') {
		fields = [
			'Customer ID',
			'Customer Name',
			'Brand ID',
			'Brand',
			'Product ID',
			'Product Ref',
			'Product UOM QTY',
			'Delivered QTY',
			'Delivered Value',
			'Service level',
			'Service Level value',
		];
	} else if (type === 'by_brand') {
		fields = [
			'Customer ID',
			'Customer Name',
			'Brand ID',
			'Brand',
			'Product UOM QTY',
			'Delivered QTY',
			'Delivered Value',
			'Service level',
			'Service Level value',
		];
	} else {
		fields = [
			'Customer ID',
			'Customer Name',
			'Product UOM QTY',
			'Delivered QTY',
			'Delivered Value',
			'Service level',
			'Service Level value',
		];
	}

	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);

	const task = new ExportB2BCustomerServiceLevel({
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
		type,
		document,
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
			subject: 'Export B2B Customer Service Level',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};
